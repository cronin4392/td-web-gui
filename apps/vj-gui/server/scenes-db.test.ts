// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openScenesDb, readScenes, readTagNames, scanSceneFolders, syncScenes } from './scenes-db';

let dir: string;
let root: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openScenesDb(dbPath);
  openDbs.push(db);
  return db;
}

function scene(name: string, meta: unknown, options: { tox?: boolean } = {}): void {
  const folder = join(root, name);
  mkdirSync(folder, { recursive: true });
  if (meta !== undefined) {
    writeFileSync(
      join(folder, 'meta.json'),
      typeof meta === 'string' ? meta : JSON.stringify(meta),
    );
  }
  if (options.tox !== false) writeFileSync(join(folder, `${name}.tox`), '');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-scenes-db-'));
  root = join(dir, 'Scenes');
  dbPath = join(dir, 'scenes.db');
  mkdirSync(root, { recursive: true });
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('scanSceneFolders', () => {
  it('reads meta.json into a scene with a derived tox path and thumbnail url', () => {
    scene('AudioSpectrum', { tags: ['audio', 'foreground'], rank: 200 });

    expect(scanSceneFolders(root)).toEqual([
      {
        name: 'AudioSpectrum',
        tags: ['audio', 'foreground'],
        rank: 200,
        dark: false,
        path: `${root.replace(/\\/g, '/')}/AudioSpectrum/AudioSpectrum.tox`,
        thumbnail: '/scenes/AudioSpectrum/thumbnail.jpg',
      },
    ]);
  });

  it('skips a folder missing meta.json or its matching tox', () => {
    scene('Kept', { tags: ['a'], rank: 1 });
    scene('NoMeta', undefined);
    scene('NoTox', { tags: ['b'], rank: 2 }, { tox: false });

    expect(scanSceneFolders(root).map((s) => s.name)).toEqual(['Kept']);
  });

  it('sorts by descending rank, with a missing or non-numeric rank last', () => {
    scene('Low', { tags: [], rank: 10 });
    scene('High', { tags: [], rank: 900 });
    scene('Unranked', { tags: [] });
    scene('Bogus', { tags: [], rank: 'nope' });

    const scanned = scanSceneFolders(root);
    expect(scanned.map((s) => s.name)).toEqual(['High', 'Low', 'Bogus', 'Unranked']);
    expect(scanned[2]?.rank).toBeNull();
  });

  it('normalises tags and defaults dark', () => {
    scene('Messy', { tags: [' neon ', 'neon', '', 7, 'text'] });

    expect(scanSceneFolders(root)[0]).toMatchObject({ tags: ['neon', 'text'], dark: false });
  });

  it('carries dark through', () => {
    scene('Covered', { tags: [], rank: 5, dark: true });

    expect(scanSceneFolders(root)[0]).toMatchObject({ dark: true });
  });

  it('reads a meta.json saved with a UTF-8 BOM', () => {
    scene('Bommed', `${String.fromCharCode(0xfeff)}${JSON.stringify({ tags: ['a'], rank: 3 })}`);

    expect(scanSceneFolders(root)[0]).toMatchObject({ name: 'Bommed', tags: ['a'], rank: 3 });
  });

  it('does not leak the on-disk folder into the catalog', () => {
    scene('Hidden', { tags: [], rank: 1 });

    expect(scanSceneFolders(root)[0]).not.toHaveProperty('folder');
  });

  it('throws with the folder name when meta.json is malformed', () => {
    scene('Broken', '{ not json');

    expect(() => scanSceneFolders(root)).toThrow(/Broken\/meta\.json/);
  });
});

describe('syncScenes', () => {
  it('round-trips the scan through the database, order and tags intact', () => {
    scene('High', { tags: ['overlay', 'text'], rank: 900, dark: true });
    scene('Low', { tags: ['audio'], rank: 10 });
    scene('Unranked', { tags: [] });

    const db = open();
    expect(syncScenes(db, root)).toEqual({ scenes: 3, tags: 3 });
    expect(readScenes(db)).toEqual(scanSceneFolders(root));
  });

  it('breaks a rank tie by the scan order, not SQLite collation order', () => {
    scene('apple', { tags: [], rank: 5 });
    scene('Banana', { tags: [], rank: 5 });
    scene('Ähnlich', { tags: [], rank: 5 });

    const db = open();
    syncScenes(db, root);

    expect(readScenes(db)).toEqual(scanSceneFolders(root));
    expect(readScenes(db).map((s) => s.name)).toEqual(['Ähnlich', 'apple', 'Banana']);
  });

  it('is deterministic — a second run leaves the same rows', () => {
    scene('One', { tags: ['a', 'b'], rank: 5 });
    scene('Two', { tags: ['a'], rank: 4 });

    const db = open();
    const first = syncScenes(db, root);
    const before = readScenes(db);
    expect(syncScenes(db, root)).toEqual(first);
    expect(readScenes(db)).toEqual(before);
  });

  it('drops scenes that vanished from disk, leaving no orphan tags', () => {
    scene('Doomed', { tags: ['a', 'b'], rank: 5 });
    scene('Survivor', { tags: ['c'], rank: 4 });

    const db = open();
    syncScenes(db, root);
    rmSync(join(root, 'Doomed'), { recursive: true, force: true });
    syncScenes(db, root);

    expect(readScenes(db).map((s) => s.name)).toEqual(['Survivor']);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM scene_tags').get() as { n: number };
    expect(n).toBe(1);
  });

  it('leaves the prior catalog untouched when a meta.json is malformed', () => {
    scene('Good', { tags: ['a'], rank: 5 });
    const db = open();
    syncScenes(db, root);

    scene('Broken', '{ not json');
    expect(() => syncScenes(db, root)).toThrow();
    expect(readScenes(db).map((s) => s.name)).toEqual(['Good']);
  });
});

describe('readTagNames', () => {
  it('orders seeded-first tags, then unranked alphabetically, then seeded-last', () => {
    scene('A', { tags: ['zebra', 'overlay', 'custom', 'apple'] });
    scene('B', { tags: ['blank', 'background', 'moss'] });

    const db = open();
    syncScenes(db, root);

    expect(readTagNames(db)).toEqual([
      'background',
      'foreground',
      'overlay',
      'blank',
      'apple',
      'moss',
      'zebra',
      'random',
      'custom',
    ]);
  });

  it('lists a seeded tag no scene carries', () => {
    scene('Only', { tags: ['kept'] });
    const db = open();
    syncScenes(db, root);

    expect(readTagNames(db)).toEqual([
      'background',
      'foreground',
      'overlay',
      'blank',
      'kept',
      'random',
      'custom',
    ]);
  });

  it('records every discovered tag, unranked', () => {
    scene('A', { tags: ['fresh'] });
    const db = open();
    syncScenes(db, root);

    expect(db.prepare("SELECT rank FROM tags WHERE name = 'fresh'").get()).toEqual({ rank: null });
  });

  it('drops a tag that no scene carries any more', () => {
    scene('A', { tags: ['transient'] });
    const db = open();
    syncScenes(db, root);
    expect(readTagNames(db)).toContain('transient');

    rmSync(join(root, 'A'), { recursive: true, force: true });
    syncScenes(db, root);

    expect(readTagNames(db)).not.toContain('transient');
  });

  it('resets a hand-edited rank on the next sync', () => {
    scene('A', { tags: ['alpha', 'omega'] });
    const db = open();
    syncScenes(db, root);

    const order = () => readTagNames(db);
    expect(order().indexOf('alpha')).toBeLessThan(order().indexOf('omega'));

    db.prepare("UPDATE tags SET rank = -50 WHERE name = 'omega'").run();
    expect(order().indexOf('omega')).toBeLessThan(order().indexOf('alpha'));

    syncScenes(db, root);
    expect(order().indexOf('alpha')).toBeLessThan(order().indexOf('omega'));

    expect(db.prepare("SELECT rank FROM tags WHERE name = 'omega'").get()).toEqual({ rank: null });
  });
});

describe('schema', () => {
  it('rebuilds a stale schema even when user_version claims to be current', () => {
    const stale = new DatabaseSync(dbPath);
    stale.exec(`
      CREATE TABLE scenes (name TEXT PRIMARY KEY, folder TEXT NOT NULL, mix TEXT NOT NULL);
      CREATE TABLE scene_tags (scene_name TEXT NOT NULL, tag TEXT NOT NULL);
      INSERT INTO scenes VALUES ('Ghost', '/gone', 'over');
      PRAGMA user_version = 99;
    `);
    stale.close();

    scene('Fresh', { tags: ['a'], rank: 1 });
    const db = open();
    syncScenes(db, root);

    expect(readScenes(db).map((s) => s.name)).toEqual(['Fresh']);
  });

  it('reopens without reseeding or losing rows', () => {
    scene('One', { tags: ['a'], rank: 1 });

    const first = open();
    syncScenes(first, root);
    first.close();
    openDbs = [];

    const second = open();
    expect(readScenes(second).map((s) => s.name)).toEqual(['One']);
  });

  it('rebuilds when a table is missing entirely', () => {
    scene('One', { tags: ['alpha'], rank: 1 });
    const first = open();
    syncScenes(first, root);
    first.exec('DROP TABLE scene_tags; DROP TABLE tags;');
    first.close();
    openDbs = [];

    const second = open();
    syncScenes(second, root);

    expect(readScenes(second)).toEqual(scanSceneFolders(root));
    expect(readTagNames(second)).toContain('alpha');
  });
});
