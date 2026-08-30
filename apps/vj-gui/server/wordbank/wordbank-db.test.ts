// @vitest-environment node
/**
 * `server/wordbank/wordbank-db.ts` tests, against real temp-file SQLite databases (not
 * `:memory:` — the migration/reopen tests need the file to persist across
 * `openWordbankDb` calls). `vitest.config.ts` is globally `jsdom`; the
 * docblock above opts this file into the `node` environment instead.
 */

import { mkdtempSync, rmSync } from 'node:fs';
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
    expect(wordbank.fields).toHaveLength(2);
  });

  it('gives a v1 database the two fields its wire params already implied', () => {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE phrases (
        tab_id TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
        phrase TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (tab_id, phrase)
      );
      CREATE TABLE recent (phrase TEXT PRIMARY KEY, position INTEGER NOT NULL);
      INSERT INTO tabs VALUES ('kept', 'Kept', 0);
      INSERT INTO phrases VALUES ('kept', 'survivor', 0);
      PRAGMA user_version = 1;
    `);
    legacy.close();

    const wordbank = readWordbank(open());
    expect(wordbank.lists.map((l) => l.id)).toEqual(['kept']);
    expect(wordbank.lists[0]?.phrases).toEqual(['survivor']);
    expect(wordbank.fields).toHaveLength(2);
  });

  it('drops the label a v2 database gave each field, keeping the lists', () => {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE text_fields (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        position INTEGER NOT NULL
      );
      CREATE TABLE tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE phrases (
        tab_id TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
        phrase TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (tab_id, phrase)
      );
      CREATE TABLE recent (phrase TEXT PRIMARY KEY, position INTEGER NOT NULL);
      INSERT INTO text_fields VALUES ('old', 'Artist name', '', 0);
      INSERT INTO tabs VALUES ('kept', 'Kept', 0);
      INSERT INTO phrases VALUES ('kept', 'survivor', 0);
      PRAGMA user_version = 2;
    `);
    legacy.close();

    const wordbank = readWordbank(open());
    expect(wordbank.lists[0]?.phrases).toEqual(['survivor']);
    expect(wordbank.fields).toHaveLength(2);
    expect(wordbank.fields.every((f) => f.defaultValue === '')).toBe(true);
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
      fields: [
        { id: 'f2', defaultValue: 'warehouse' },
        { id: 'f1', defaultValue: '' },
      ],
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
    expect(read.fields.map((f) => f.id)).toEqual(['f2', 'f1']);
    expect(read.fields[0]?.defaultValue).toBe('warehouse');
  });

  it('a rewrite fully replaces prior contents — no orphaned rows', () => {
    const db = open();
    writeWordbank(db, {
      fields: [
        { id: 'gone', defaultValue: '' },
        { id: 'gone2', defaultValue: '' },
      ],
      lists: [{ id: 'old', name: 'Old', phrases: ['stale'] }],
      recent: ['stale recent'],
    });
    writeWordbank(db, {
      fields: [
        { id: 'kept', defaultValue: '' },
        { id: 'kept2', defaultValue: '' },
      ],
      lists: [{ id: 'new', name: 'New', phrases: ['fresh'] }],
      recent: ['fresh recent'],
    });

    const read = readWordbank(db);
    expect(read.lists.map((l) => l.id)).toEqual(['new']);
    expect(read.recent).toEqual(['fresh recent']);
    expect(read.fields.map((f) => f.id)).toEqual(['kept', 'kept2']);

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
      fields: [],
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
      fields: [],
      lists: [{ id: 'tab-a', name: 'Cues', phrases: ['keeper'] }],
      recent: [],
    });

    expect(() =>
      writeWordbank(db, {
        fields: [],
        lists: [{ id: 'tab-a', name: 'Cues', phrases: ['dup', 'dup'] }],
        recent: [],
      }),
    ).toThrow();

    // Rolled back — the prior good state is untouched, not half-applied.
    const read = readWordbank(db);
    expect(read.lists[0]?.phrases).toEqual(['keeper']);
  });
});
