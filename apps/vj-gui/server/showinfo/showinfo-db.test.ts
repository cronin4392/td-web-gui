// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShowDocument } from '../../domain/showinfo/showinfo';
import { openShowInfoDb, readShowDocument, writeShowDocument } from './showinfo-db';

let dir: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openShowInfoDb(dbPath);
  openDbs.push(db);
  return db;
}

const doc: ShowDocument = {
  show: {
    rows: [
      { id: 'r2', alias: 'venue', text: '', on: false },
      { id: 'r1', alias: null, text: 'Line one\nLine two', on: true },
    ],
    artists: [
      { id: 'a2', name: 'Zed', active: false },
      { id: 'a1', name: 'Amy', active: true },
    ],
  },
  overrides: { A: ['hello', ''], Z6: ['', '', 'third'] },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'showinfo-db-'));
  dbPath = join(dir, 'test.db');
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('openShowInfoDb guard', () => {
  it('refuses to create a database its snapshot could still rebuild', () => {
    const root = mkdtempSync(join(tmpdir(), 'showinfo-guard-'));
    mkdirSync(join(root, 'snapshots'), { recursive: true });
    writeFileSync(join(root, 'snapshots', 'showinfo.sql'), '', 'utf8');
    const path = join(root, 'showinfo.db');
    expect(() => openShowInfoDb(path)).toThrow(/db:restore/);
    expect(existsSync(path)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('migration', () => {
  it('drops crew rows and the crew column from a version 1 database', () => {
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

    expect(readShowDocument(open()).show).toEqual({
      rows: [
        { id: 'r1', alias: 'artist', text: '', on: true },
        { id: 'r3', alias: 'city', text: 'Boston', on: true },
      ],
      artists: [{ id: 'a1', name: 'Variable', active: true }],
    });
  });
});

describe('round trip', () => {
  it('reads back exactly what was written, in order, blanks kept', () => {
    const db = open();
    writeShowDocument(db, doc);
    expect(readShowDocument(db)).toEqual(doc);
  });

  it('replaces the previous document rather than merging into it', () => {
    const db = open();
    writeShowDocument(db, doc);
    const next: ShowDocument = { show: { rows: [], artists: [] }, overrides: {} };
    writeShowDocument(db, next);
    expect(readShowDocument(db)).toEqual(next);
  });

  it('survives reopening without reseeding', () => {
    const db = open();
    writeShowDocument(db, doc);
    db.close();
    openDbs = [];
    expect(readShowDocument(open())).toEqual(doc);
  });

  it('rolls back a write that fails midway', () => {
    const db = open();
    writeShowDocument(db, doc);
    const duplicateIds: ShowDocument = {
      show: {
        rows: [
          { id: 'same', alias: null, text: 'a', on: true },
          { id: 'same', alias: null, text: 'b', on: true },
        ],
        artists: [],
      },
      overrides: {},
    };
    expect(() => writeShowDocument(db, duplicateIds)).toThrow();
    expect(readShowDocument(db)).toEqual(doc);
  });
});
