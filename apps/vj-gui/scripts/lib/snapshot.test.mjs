// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  emptiedTables,
  exportSql,
  hasUnexportedChanges,
  restoreDb,
  snapshotPath,
  snapshotRowCounts,
  sortRoots,
} from './snapshot.mjs';

let dir;

function dbPath(name = 'scenes.db') {
  return join(dir, 'data', name);
}

function make(path, statements) {
  mkdirSync(join(path, '..'), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    for (const statement of statements) db.exec(statement);
  } finally {
    db.close();
  }
  return path;
}

function writeSnapshot(path, sql) {
  const target = snapshotPath(path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, sql, 'utf8');
  return target;
}

const CATALOG = [
  'CREATE TABLE scenes (name TEXT PRIMARY KEY NOT NULL, folder TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE tags (scene TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (scene, tag))',
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('exportSql', () => {
  it('orders rows by primary key, not by insertion order', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Zulu', 'z', 0), ('Alpha', 'a', 0), ('Mike', 'm', 0)`,
    ]);
    const names = [...exportSql(path).sql.matchAll(/VALUES \('(\w+)'/g)].map(([, name]) => name);
    expect(names).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('orders a keyless table by rowid', () => {
    const path = make(dbPath(), [
      'CREATE TABLE recent (phrase TEXT NOT NULL)',
      `INSERT INTO recent VALUES ('second'), ('first')`,
    ]);
    expect(exportSql(path).sql).toMatch(/'second'[\s\S]*'first'/);
  });

  it('escapes quotes in values and identifiers', () => {
    const path = make(dbPath(), [
      'CREATE TABLE scenes ("odd""name" TEXT PRIMARY KEY NOT NULL)',
      `INSERT INTO scenes VALUES ('it''s here')`,
    ]);
    const { sql } = exportSql(path);
    expect(sql).toContain('"odd""name"');
    expect(sql).toContain(`'it''s here'`);
  });

  it('writes NULL, blobs and numbers in round-trippable form', () => {
    const path = make(dbPath(), [
      'CREATE TABLE mixed (id INTEGER PRIMARY KEY, note TEXT, blob BLOB, size REAL)',
    ]);
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO mixed VALUES (?, ?, ?, ?)').run(
      1,
      null,
      new Uint8Array([0xde, 0xad]),
      1.5,
    );
    db.close();
    const { sql } = exportSql(path);
    expect(sql).toContain(`VALUES (1, NULL, X'dead', 1.5);`);
  });

  it('keeps the AUTOINCREMENT counter the schema query filters out', () => {
    const path = make(dbPath(), [
      'CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, line TEXT)',
      `INSERT INTO log (line) VALUES ('a'), ('b')`,
      'DELETE FROM log',
    ]);
    const { sql } = exportSql(path);
    expect(sql).toContain('DELETE FROM sqlite_sequence;');
    expect(sql).toContain(`INSERT INTO sqlite_sequence (name, seq) VALUES ('log', 2);`);
  });

  it('carries a non-zero user_version', () => {
    const path = make(dbPath(), [...CATALOG, 'PRAGMA user_version = 2']);
    expect(exportSql(path).sql).toContain('PRAGMA user_version=2;');
  });

  it('is byte-identical across repeated exports', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Alpha', 'a', 0), ('Mike', 'm', 1)`,
    ]);
    expect(exportSql(path).sql).toBe(exportSql(path).sql);
  });

  it('counts rows per table', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Alpha', 'a', 0)`,
      `INSERT INTO tags VALUES ('Alpha', 'dark'), ('Alpha', 'slow')`,
    ]);
    expect(exportSql(path).rowCounts).toEqual(
      new Map([
        ['scenes', 1],
        ['tags', 2],
      ]),
    );
  });
});

describe('exportSql strip', () => {
  const root = 'C:/Content/Effects';

  it('rewrites a value under the root as relative to it', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', '${root}/3 Effect/Blur', 0)`,
    ]);
    const { sql, relativised } = exportSql(path, { strip: [root] });
    expect(sql).toContain(`'3 Effect/Blur'`);
    expect(sql).not.toContain(root);
    expect(relativised).toBe(1);
  });

  it('matches a root whose case differs from the stored path', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', 'c:/Content/Effects/Blur', 0)`,
    ]);
    expect(exportSql(path, { strip: [root] }).sql).toContain(`'Blur', 'Blur'`);
  });

  it('accepts a root with a trailing slash or backslashes', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', '${root}/Blur', 0)`,
    ]);
    expect(exportSql(path, { strip: ['C:\\Content\\Effects\\'] }).sql).toContain(`'Blur', 'Blur'`);
  });

  it('prefers the longest matching root', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', '${root}/Blur', 0)`,
    ]);
    const { sql } = exportSql(path, { strip: ['C:/Content', root] });
    expect(sql).toContain(`'Blur', 'Blur'`);
  });

  it('leaves a value outside every root alone', () => {
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', 'D:/Elsewhere/Blur', 0)`,
    ]);
    const { sql, relativised } = exportSql(path, { strip: [root] });
    expect(sql).toContain(`'D:/Elsewhere/Blur'`);
    expect(relativised).toBe(0);
  });

  it('sorts and normalises roots longest-first', () => {
    expect(sortRoots(['C:/a/', 'C:\\a\\b', ''])).toEqual(['C:/a/b', 'C:/a']);
  });
});

describe('snapshotRowCounts', () => {
  it('counts the inserts per table', () => {
    const sql = [
      `INSERT INTO "scenes" ("name") VALUES ('a');`,
      `INSERT INTO "scenes" ("name") VALUES ('b');`,
      `INSERT INTO "tags" ("tag") VALUES ('dark');`,
    ].join('\n');
    expect(snapshotRowCounts(sql)).toEqual(
      new Map([
        ['scenes', 2],
        ['tags', 1],
      ]),
    );
  });

  it('reads an escaped table name back', () => {
    expect(snapshotRowCounts(`INSERT INTO "odd""name" ("x") VALUES (1);`)).toEqual(
      new Map([['odd"name', 1]]),
    );
  });
});

describe('emptiedTables', () => {
  const snapshot = [
    `INSERT INTO "scenes" ("name") VALUES ('a');`,
    `INSERT INTO "tags" ("tag") VALUES ('dark');`,
  ].join('\n');

  it('names a table the live database emptied while the snapshot still has rows', () => {
    const counts = new Map([
      ['scenes', 0],
      ['tags', 1],
    ]);
    expect(emptiedTables(counts, snapshot)).toEqual(['scenes']);
  });

  it('is not fooled by another table still holding rows', () => {
    const counts = new Map([
      ['scenes', 0],
      ['tags', 0],
    ]);
    expect(emptiedTables(counts, snapshot)).toEqual(['scenes', 'tags']);
  });

  it('passes a table that kept its rows', () => {
    const counts = new Map([
      ['scenes', 1],
      ['tags', 1],
    ]);
    expect(emptiedTables(counts, snapshot)).toEqual([]);
  });

  it('passes a table the snapshot never had rows for', () => {
    const counts = new Map([
      ['scenes', 1],
      ['tags', 1],
      ['recent', 0],
    ]);
    expect(emptiedTables(counts, snapshot)).toEqual([]);
  });

  it('names a table the live database no longer has at all', () => {
    expect(emptiedTables(new Map([['tags', 1]]), snapshot)).toEqual(['scenes']);
  });
});

describe('restoreDb', () => {
  it('round-trips a database byte-for-byte', () => {
    const source = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Alpha', 'a', 0), ('Mike', 'm', 1)`,
      `INSERT INTO tags VALUES ('Alpha', 'dark')`,
    ]);
    const sql = exportSql(source).sql;
    const target = writeSnapshot(source, sql);

    const rebuilt = dbPath('rebuilt.db');
    restoreDb(rebuilt, target);
    expect(exportSql(rebuilt).sql).toBe(sql);
  });

  it('leaves the existing database untouched when the snapshot is broken', () => {
    const path = make(dbPath(), [...CATALOG, `INSERT INTO scenes VALUES ('Alpha', 'a', 0)`]);
    const before = exportSql(path).sql;
    const target = writeSnapshot(path, 'CREATE TABLE ( this is not sql;');

    expect(() => restoreDb(path, target)).toThrow();
    expect(exportSql(path).sql).toBe(before);
    expect(existsSync(`${path}.restoring`)).toBe(false);
  });

  it('keeps the journal when the database cannot be replaced', () => {
    const source = make(dbPath('source.db'), [...CATALOG]);
    const path = dbPath();
    mkdirSync(path, { recursive: true });
    const target = writeSnapshot(path, exportSql(source).sql);
    writeFileSync(`${path}-wal`, 'live', 'utf8');

    expect(() => restoreDb(path, target)).toThrow();
    expect(existsSync(`${path}-wal`)).toBe(true);
    expect(existsSync(`${path}.restoring`)).toBe(false);
  });

  it('discards a journal left beside the replaced database', () => {
    const path = make(dbPath(), [...CATALOG]);
    const target = writeSnapshot(path, exportSql(path).sql);
    writeFileSync(`${path}-wal`, 'stale', 'utf8');
    writeFileSync(`${path}-shm`, 'stale', 'utf8');

    restoreDb(path, target);
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-shm`)).toBe(false);
  });
});

describe('hasUnexportedChanges', () => {
  it('is false right after an export', () => {
    const path = make(dbPath(), [...CATALOG, `INSERT INTO scenes VALUES ('Alpha', 'a', 0)`]);
    const target = writeSnapshot(path, exportSql(path).sql);
    expect(hasUnexportedChanges(path, target)).toBe(false);
  });

  it('is true once a row is authored', () => {
    const path = make(dbPath(), [...CATALOG, `INSERT INTO scenes VALUES ('Alpha', 'a', 0)`]);
    const target = writeSnapshot(path, exportSql(path).sql);
    const db = new DatabaseSync(path);
    db.exec(`UPDATE scenes SET hidden = 1 WHERE name = 'Alpha'`);
    db.close();
    expect(hasUnexportedChanges(path, target)).toBe(true);
  });

  it('compares through the same strip roots the snapshot was written with', () => {
    const root = 'C:/Content/Effects';
    const path = make(dbPath(), [
      ...CATALOG,
      `INSERT INTO scenes VALUES ('Blur', '${root}/Blur', 0)`,
    ]);
    const target = writeSnapshot(path, exportSql(path, { strip: [root] }).sql);
    expect(hasUnexportedChanges(path, target, { strip: [root] })).toBe(false);
    expect(hasUnexportedChanges(path, target)).toBe(true);
  });

  it('is false when there is no snapshot to compare against', () => {
    const path = make(dbPath(), [...CATALOG]);
    expect(hasUnexportedChanges(path, snapshotPath(path))).toBe(false);
  });
});

describe('snapshotPath', () => {
  it('sits beside the database under snapshots/', () => {
    expect(snapshotPath(join('data', 'scenes.db'))).toBe(join('data', 'snapshots', 'scenes.sql'));
  });
});

describe('the tracked snapshots', () => {
  it('carry no absolute content root', () => {
    for (const name of ['scenes', 'effects', 'wordbank']) {
      const sql = readFileSync(join('data', 'snapshots', `${name}.sql`), 'utf8');
      expect(sql, name).not.toMatch(/'[A-Za-z]:\//);
    }
  });
});
