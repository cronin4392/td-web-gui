// @vitest-environment node
/**
 * `server/wordbank/wordbank-db.ts` tests, against real temp-file SQLite databases (not
 * `:memory:` — the migration/reopen tests need the file to persist across
 * `openWordbankDb` calls). `vitest.config.ts` is globally `jsdom`; the
 * docblock above opts this file into the `node` environment instead.
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Wordbank } from '../../domain/wordbank/wordbank';
import { openWordbankDb, readWordbank, writeWordbank } from './wordbank-db';

let dir: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openWordbankDb(dbPath);
  openDbs.push(db);
  return db;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wordbank-db-'));
  dbPath = join(dir, 'test.db');
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('schema + seed', () => {
  it('creates the schema and seeds a single "List 1" list on a fresh file', () => {
    const db = open();
    const wordbank = readWordbank(db);
    expect(wordbank.lists).toHaveLength(1);
    expect(wordbank.lists[0]?.name).toBe('List 1');
    expect(wordbank.lists[0]?.phrases).toEqual([]);
    expect(wordbank.recent).toEqual([]);
  });

  it('migration is idempotent on reopen — no reseed, no duplication', () => {
    const first = open();
    const seededId = readWordbank(first).lists[0]!.id;
    first.close();
    openDbs = [];

    const second = open();
    const wordbank = readWordbank(second);
    expect(wordbank.lists).toHaveLength(1);
    expect(wordbank.lists[0]?.id).toBe(seededId);
  });
});

describe('round-trip', () => {
  it('preserves list, phrase, and recent ordering', () => {
    const db = open();
    const written: Wordbank = {
      lists: [
        { id: 'tab-b', name: 'Titles', phrases: ['zeta', 'alpha'] },
        { id: 'tab-a', name: 'Cues', phrases: ['intermission', 'hello world'] },
      ],
      recent: ['cue two', 'hello world', 'intermission'],
    };
    writeWordbank(db, written);

    const read = readWordbank(db);
    expect(read.lists.map((l) => l.id)).toEqual(['tab-b', 'tab-a']);
    expect(read.lists[0]?.phrases).toEqual(['zeta', 'alpha']);
    expect(read.lists[1]?.phrases).toEqual(['intermission', 'hello world']);
    expect(read.recent).toEqual(['cue two', 'hello world', 'intermission']);
  });

  it('a rewrite fully replaces prior contents — no orphaned rows', () => {
    const db = open();
    writeWordbank(db, {
      lists: [{ id: 'old', name: 'Old', phrases: ['stale'] }],
      recent: ['stale recent'],
    });
    writeWordbank(db, {
      lists: [{ id: 'new', name: 'New', phrases: ['fresh'] }],
      recent: ['fresh recent'],
    });

    const read = readWordbank(db);
    expect(read.lists.map((l) => l.id)).toEqual(['new']);
    expect(read.recent).toEqual(['fresh recent']);

    const orphanPhrases = db
      .prepare('SELECT COUNT(*) AS n FROM phrases WHERE tab_id = ?')
      .get('old') as {
      n: number;
    };
    expect(orphanPhrases.n).toBe(0);
  });
});

describe('integrity', () => {
  it("ON DELETE CASCADE removes a dropped list's phrases", () => {
    const db = open();
    writeWordbank(db, {
      lists: [{ id: 'doomed', name: 'Doomed', phrases: ['a', 'b'] }],
      recent: [],
    });

    db.exec("DELETE FROM tabs WHERE id = 'doomed'");

    const remaining = db
      .prepare('SELECT COUNT(*) AS n FROM phrases WHERE tab_id = ?')
      .get('doomed') as {
      n: number;
    };
    expect(remaining.n).toBe(0);
  });

  it('rejects a duplicate phrase within one list (primary key) and rolls back the whole write', () => {
    const db = open();
    writeWordbank(db, {
      lists: [{ id: 'tab-a', name: 'Cues', phrases: ['keeper'] }],
      recent: [],
    });

    expect(() =>
      writeWordbank(db, {
        lists: [{ id: 'tab-a', name: 'Cues', phrases: ['dup', 'dup'] }],
        recent: [],
      }),
    ).toThrow();

    // Rolled back — the prior good state is untouched, not half-applied.
    const read = readWordbank(db);
    expect(read.lists[0]?.phrases).toEqual(['keeper']);
  });
});

describe('durability of a write', () => {
  it('lands the wordbank in the file itself, not just the write-ahead log', () => {
    const db = open();
    writeWordbank(db, {
      lists: [{ id: 'a', name: 'Set', phrases: ['one', 'two'] }],
      recent: ['one'],
    });

    // The `.db` without its journals — what `git status` compares and what a
    // commit stages. A write left in the WAL is missing from this copy.
    const copy = join(dir, 'snapshot.db');
    copyFileSync(dbPath, copy);
    const snapshot = new DatabaseSync(copy);
    const lists = (
      snapshot.prepare('SELECT name FROM tabs ORDER BY position').all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    const { n } = snapshot.prepare('SELECT COUNT(*) AS n FROM phrases').get() as { n: number };
    snapshot.close();

    expect(lists).toEqual(['Set']);
    expect(n).toBe(2);
  });
});
