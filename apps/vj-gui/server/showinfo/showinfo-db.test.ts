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
      { id: 'a2', name: 'Zed', crew: '', active: false },
      { id: 'a1', name: 'Amy', crew: 'Crew A', active: true },
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
