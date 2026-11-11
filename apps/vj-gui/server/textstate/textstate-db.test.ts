// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TextState } from '../../domain/textstate/textstate';
import { openTextStateDb, readTextState, writeTextState } from './textstate-db';

let dir: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openTextStateDb(dbPath);
  openDbs.push(db);
  return db;
}

const state: TextState = {
  show: {
    rows: [
      { id: 'r2', alias: 'venue', text: '', on: false },
      { id: 'r1', alias: null, text: 'Line one\nLine two', on: true },
      { id: 'a2', alias: 'artist', text: 'Zed', on: false },
    ],
  },
  overrides: { A: ['hello', ''], Z6: ['', '', 'third'] },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'textstate-db-'));
  dbPath = join(dir, 'test.db');
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('openTextStateDb guard', () => {
  it('refuses to create a database its snapshot could still rebuild', () => {
    const root = mkdtempSync(join(tmpdir(), 'textstate-guard-'));
    mkdirSync(join(root, 'snapshots'), { recursive: true });
    writeFileSync(join(root, 'snapshots', 'textstate.sql'), '', 'utf8');
    const path = join(root, 'textstate.db');
    expect(() => openTextStateDb(path)).toThrow(/db:restore/);
    expect(existsSync(path)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

const V2_SCHEMA = `
  CREATE TABLE show_rows (id TEXT PRIMARY KEY, position INTEGER NOT NULL, alias TEXT, text TEXT NOT NULL, is_on INTEGER NOT NULL);
  CREATE TABLE artists (id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL, is_active INTEGER NOT NULL);
  CREATE TABLE layer_overrides (layer TEXT NOT NULL, slot INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (layer, slot));
`;

function seedV2(sql: string): void {
  const v2 = new DatabaseSync(dbPath);
  v2.exec(V2_SCHEMA + sql + 'PRAGMA user_version = 2;');
  v2.close();
}

describe('migration', () => {
  it('drops crew rows and turns the artists into rows from a version 1 database', () => {
    const v1 = new DatabaseSync(dbPath);
    v1.exec(`
      CREATE TABLE show_rows (id TEXT PRIMARY KEY, position INTEGER NOT NULL, alias TEXT, text TEXT NOT NULL, is_on INTEGER NOT NULL);
      CREATE TABLE artists (id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL, crew TEXT NOT NULL, is_active INTEGER NOT NULL);
      CREATE TABLE layer_overrides (layer TEXT NOT NULL, slot INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (layer, slot));
      INSERT INTO show_rows VALUES ('r1', 0, 'artist', '', 1), ('r2', 1, 'crew', '', 1), ('r3', 2, 'city', 'Boston', 1);
      INSERT INTO artists VALUES ('a1', 0, 'Variable', 'Rezinate', 1);
      PRAGMA user_version = 1;
    `);
    v1.close();

    expect(readTextState(open()).show.rows).toEqual([
      { id: 'a1', alias: 'artist', text: 'Variable', on: true },
      { id: 'r3', alias: 'city', text: 'Boston', on: true },
    ]);
  });

  it('puts one row per artist where the artist row was, on only if both were', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'event', 'Elements', 1), ('r2', 1, 'artist', '', 1), ('r3', 2, 'city', 'Boston', 0);
      INSERT INTO artists VALUES ('a2', 1, 'Audio Fields', 1), ('a1', 0, 'Variable', 1), ('a3', 2, 'Resting', 0);
    `);
    expect(readTextState(open()).show.rows).toEqual([
      { id: 'r1', alias: 'event', text: 'Elements', on: true },
      { id: 'a1', alias: 'artist', text: 'Variable', on: true },
      { id: 'a2', alias: 'artist', text: 'Audio Fields', on: true },
      { id: 'a3', alias: 'artist', text: 'Resting', on: false },
      { id: 'r3', alias: 'city', text: 'Boston', on: false },
    ]);
  });

  it('keeps the artists off under an artist row that was off', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'artist', '', 0);
      INSERT INTO artists VALUES ('a1', 0, 'Variable', 1);
    `);
    expect(readTextState(open()).show.rows).toEqual([
      { id: 'a1', alias: 'artist', text: 'Variable', on: false },
    ]);
  });

  it('keeps a blank artist row when no artist has a name', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'artist', '', 1);
      INSERT INTO artists VALUES ('a1', 0, '  ', 1);
    `);
    expect(readTextState(open()).show.rows).toEqual([
      { id: 'r1', alias: 'artist', text: '', on: true },
    ]);
  });

  it('adds the artists switched off when no row placed them', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'event', 'Elements', 1);
      INSERT INTO artists VALUES ('a1', 0, 'Variable', 1);
    `);
    expect(readTextState(open()).show.rows).toEqual([
      { id: 'r1', alias: 'event', text: 'Elements', on: true },
      { id: 'a1', alias: 'artist', text: 'Variable', on: false },
    ]);
  });

  it('repeats the artists under a second artist row, with new ids', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'artist', '', 1), ('r2', 1, 'artist', '', 1);
      INSERT INTO artists VALUES ('a1', 0, 'Variable', 1);
    `);
    const rows = readTextState(open()).show.rows;
    expect(rows.map((r) => r.text)).toEqual(['Variable', 'Variable']);
    expect(rows[0]!.id).toBe('a1');
    expect(rows[1]!.id).not.toBe('a1');
  });

  it('leaves the overrides alone and drops the artists table', () => {
    seedV2(`
      INSERT INTO show_rows VALUES ('r1', 0, 'artist', '', 1);
      INSERT INTO artists VALUES ('a1', 0, 'Variable', 1);
      INSERT INTO layer_overrides VALUES ('A', 0, 'Hello');
    `);
    const db = open();
    expect(readTextState(db).overrides).toEqual({ A: ['Hello'] });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).not.toContain('artists');
  });
});

describe('round trip', () => {
  it('reads back exactly what was written, in order, blanks kept', () => {
    const db = open();
    writeTextState(db, state);
    expect(readTextState(db)).toEqual(state);
  });

  it('replaces the previous text state rather than merging into it', () => {
    const db = open();
    writeTextState(db, state);
    const next: TextState = { show: { rows: [] }, overrides: {} };
    writeTextState(db, next);
    expect(readTextState(db)).toEqual(next);
  });

  it('survives reopening without reseeding', () => {
    const db = open();
    writeTextState(db, state);
    db.close();
    openDbs = [];
    expect(readTextState(open())).toEqual(state);
  });

  it('rolls back a write that fails midway', () => {
    const db = open();
    writeTextState(db, state);
    const duplicateIds: TextState = {
      show: {
        rows: [
          { id: 'same', alias: null, text: 'a', on: true },
          { id: 'same', alias: null, text: 'b', on: true },
        ],
      },
      overrides: {},
    };
    expect(() => writeTextState(db, duplicateIds)).toThrow();
    expect(readTextState(db)).toEqual(state);
  });
});
