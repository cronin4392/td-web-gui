// @vitest-environment node
/**
 * `server/text-db.ts` tests, against real temp-file SQLite databases (not
 * `:memory:` — the migration/reopen tests need the file to persist across
 * `openLibraryDb` calls). `vitest.config.ts` is globally `jsdom`; the
 * docblock above opts this file into the `node` environment instead.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Library } from '../../domain/wordbank/wordbank';
import { openLibraryDb, readLibrary, writeLibrary } from './text-db';

let dir: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openLibraryDb(dbPath);
  openDbs.push(db);
  return db;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'text-selector-db-'));
  dbPath = join(dir, 'test.db');
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('schema + seed', () => {
  it('creates the schema and seeds a single "List 1" tab on a fresh file', () => {
    const db = open();
    const library = readLibrary(db);
    expect(library.tabs).toHaveLength(1);
    expect(library.tabs[0]?.name).toBe('List 1');
    expect(library.tabs[0]?.phrases).toEqual([]);
    expect(library.recent).toEqual([]);
  });

  it('migration is idempotent on reopen — no reseed, no duplication', () => {
    const first = open();
    const seededId = readLibrary(first).tabs[0]!.id;
    first.close();
    openDbs = [];

    const second = open();
    const library = readLibrary(second);
    expect(library.tabs).toHaveLength(1);
    expect(library.tabs[0]?.id).toBe(seededId);
  });
});

describe('round-trip', () => {
  it('preserves tab, phrase, and recent ordering', () => {
    const db = open();
    const written: Library = {
      tabs: [
        { id: 'tab-b', name: 'Titles', phrases: ['zeta', 'alpha'] },
        { id: 'tab-a', name: 'Cues', phrases: ['intermission', 'hello world'] },
      ],
      recent: ['cue two', 'hello world', 'intermission'],
    };
    writeLibrary(db, written);

    const read = readLibrary(db);
    expect(read.tabs.map((t) => t.id)).toEqual(['tab-b', 'tab-a']);
    expect(read.tabs[0]?.phrases).toEqual(['zeta', 'alpha']);
    expect(read.tabs[1]?.phrases).toEqual(['intermission', 'hello world']);
    expect(read.recent).toEqual(['cue two', 'hello world', 'intermission']);
  });

  it('a rewrite fully replaces prior contents — no orphaned rows', () => {
    const db = open();
    writeLibrary(db, {
      tabs: [{ id: 'old', name: 'Old', phrases: ['stale'] }],
      recent: ['stale recent'],
    });
    writeLibrary(db, {
      tabs: [{ id: 'new', name: 'New', phrases: ['fresh'] }],
      recent: ['fresh recent'],
    });

    const read = readLibrary(db);
    expect(read.tabs.map((t) => t.id)).toEqual(['new']);
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
  it("ON DELETE CASCADE removes a dropped tab's phrases", () => {
    const db = open();
    writeLibrary(db, {
      tabs: [{ id: 'doomed', name: 'Doomed', phrases: ['a', 'b'] }],
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

  it('rejects a duplicate phrase within one tab (primary key) and rolls back the whole write', () => {
    const db = open();
    writeLibrary(db, {
      tabs: [{ id: 'tab-a', name: 'Cues', phrases: ['keeper'] }],
      recent: [],
    });

    expect(() =>
      writeLibrary(db, {
        tabs: [{ id: 'tab-a', name: 'Cues', phrases: ['dup', 'dup'] }],
        recent: [],
      }),
    ).toThrow();

    // Rolled back — the prior good state is untouched, not half-applied.
    const read = readLibrary(db);
    expect(read.tabs[0]?.phrases).toEqual(['keeper']);
  });
});
