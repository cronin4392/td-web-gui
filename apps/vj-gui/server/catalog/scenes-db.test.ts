// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTag,
  deleteTag,
  openScenesDb,
  readScenes,
  readTagNames,
  renameTag,
  scanSceneFolders,
  setSceneHidden,
  setSceneTag,
  setTagOrder,
  syncScenes,
} from './scenes-db';

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
        // Authored in the GUI, so a Scan reports none however many meta.json lists.
        tags: [],
        rank: 200,
        dark: false,
        hidden: false,
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

  it('ignores meta.json tags entirely and defaults dark', () => {
    scene('Messy', { tags: [' neon ', 'neon', '', 7, 'text'] });

    expect(scanSceneFolders(root)[0]).toMatchObject({ tags: [], dark: false });
  });

  it('carries dark through', () => {
    scene('Covered', { tags: [], rank: 5, dark: true });

    expect(scanSceneFolders(root)[0]).toMatchObject({ dark: true });
  });

  it('reads a meta.json saved with a UTF-8 BOM', () => {
    scene('Bommed', `${String.fromCharCode(0xfeff)}${JSON.stringify({ rank: 3 })}`);

    expect(scanSceneFolders(root)[0]).toMatchObject({ name: 'Bommed', rank: 3 });
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
    expect(syncScenes(db, root)).toEqual({ scenes: 3 });
    expect(readScenes(db)).toEqual(scanSceneFolders(root));
  });

  it('breaks a rank tie through the scan comparator, not SQLite collation', () => {
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

  it('drops scenes that vanished from disk, leaving no orphan tag links', () => {
    scene('Doomed', { rank: 5 });
    scene('Survivor', { rank: 4 });

    const db = open();
    syncScenes(db, root);
    createTag(db, 'a');
    setSceneTag(db, 'Doomed', 'a', true);
    setSceneTag(db, 'Survivor', 'a', true);

    rmSync(join(root, 'Doomed'), { recursive: true, force: true });
    syncScenes(db, root);

    expect(readScenes(db).map((s) => s.name)).toEqual(['Survivor']);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM scene_tags').get() as { n: number };
    expect(n).toBe(1);
  });

  it('leaves authored tags and their scene links alone', () => {
    scene('One', { tags: ['ignored'], rank: 5 });

    const db = open();
    syncScenes(db, root);
    createTag(db, 'mine');
    setSceneTag(db, 'One', 'mine', true);

    syncScenes(db, root);

    expect(readTagNames(db)).toContain('mine');
    expect(readScenes(db)[0]?.tags).toEqual(['mine']);
  });

  it('never adds a tag of its own, however many meta.json lists', () => {
    scene('One', { tags: ['fresh', 'alsofresh'], rank: 5 });

    const db = open();
    const before = readTagNames(db);
    syncScenes(db, root);

    expect(readTagNames(db)).toEqual(before);
    expect(readScenes(db)[0]?.tags).toEqual([]);
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

describe('tag seeding and rank normalisation', () => {
  it('seeds the opening picker into a catalog that has never synced', () => {
    expect(readTagNames(open())).toEqual([
      'background',
      'foreground',
      'overlay',
      'blank',
      'random',
      'custom',
    ]);
  });

  it('does not seed over a catalog that already has scenes', () => {
    scene('One', {});
    const first = open();
    syncScenes(first, root);
    for (const tag of readTagNames(first)) deleteTag(first, tag);
    first.close();
    openDbs = [];

    // The six coming back on every dev-server restart is the bug this guards.
    expect(readTagNames(open())).toEqual([]);
  });

  it('carries the legacy sync order into dense ranks', () => {
    scene('One', {});
    const db = open();
    syncScenes(db, root);

    // The shape sync used to leave behind: fixed ranks around an unranked middle.
    db.exec(`
      DELETE FROM tags;
      INSERT INTO tags (name, rank) VALUES
        ('background', -400), ('overlay', -200), ('custom', 200),
        ('zebra', NULL), ('apple', NULL), ('moss', NULL);
    `);
    db.close();
    openDbs = [];

    const reopened = open();
    expect(readTagNames(reopened)).toEqual([
      'background',
      'overlay',
      'apple',
      'moss',
      'zebra',
      'custom',
    ]);
    const { n } = reopened.prepare('SELECT COUNT(*) AS n FROM tags WHERE rank IS NULL').get() as {
      n: number;
    };
    expect(n).toBe(0);
  });

  it('leaves an already-dense order untouched on reopen', () => {
    scene('One', {});
    const first = open();
    syncScenes(first, root);
    setTagOrder(first, [...readTagNames(first)].reverse());
    const order = readTagNames(first);
    first.close();
    openDbs = [];

    expect(readTagNames(open())).toEqual(order);
  });

  it('keeps a hand-authored rank across a sync', () => {
    scene('A', {});
    const db = open();
    syncScenes(db, root);
    createTag(db, 'alpha');
    createTag(db, 'omega');

    setTagOrder(db, [
      'omega',
      'alpha',
      ...readTagNames(db).filter((t) => t !== 'alpha' && t !== 'omega'),
    ]);
    const order = readTagNames(db);

    syncScenes(db, root);

    expect(readTagNames(db)).toEqual(order);
  });

  it('keeps a tag no scene carries any more', () => {
    scene('A', {});
    const db = open();
    syncScenes(db, root);
    createTag(db, 'kept');
    setSceneTag(db, 'A', 'kept', true);

    rmSync(join(root, 'A'), { recursive: true, force: true });
    syncScenes(db, root);

    expect(readTagNames(db)).toContain('kept');
  });
});

describe('tag mutations', () => {
  function fresh(): DatabaseSync {
    scene('One', {});
    scene('Two', {});
    const db = open();
    syncScenes(db, root);
    for (const tag of readTagNames(db)) deleteTag(db, tag);
    return db;
  }

  it('appends a created tag last and trims its name', () => {
    const db = fresh();
    createTag(db, 'first');
    createTag(db, '  second  ');

    expect(readTagNames(db)).toEqual(['first', 'second']);
  });

  it('refuses a blank name', () => {
    const db = fresh();
    expect(() => createTag(db, '   ')).toThrow(/needs a name/);
  });

  it('refuses a duplicate, including one differing only in case', () => {
    const db = fresh();
    createTag(db, 'Neon');

    expect(() => createTag(db, 'Neon')).toThrow(/already exists/);
    expect(() => createTag(db, 'neon')).toThrow(/already exists/);
    expect(readTagNames(db)).toEqual(['Neon']);
  });

  it('renames in place, carrying the scenes and the slot', () => {
    const db = fresh();
    createTag(db, 'before');
    createTag(db, 'after');
    setSceneTag(db, 'One', 'before', true);

    renameTag(db, 'before', 'renamed');

    expect(readTagNames(db)).toEqual(['renamed', 'after']);
    expect(readScenes(db).find((s) => s.name === 'One')?.tags).toEqual(['renamed']);
  });

  it('allows a change of case but not a collision', () => {
    const db = fresh();
    createTag(db, 'neon');
    createTag(db, 'text');

    renameTag(db, 'neon', 'Neon');
    expect(readTagNames(db)).toContain('Neon');

    expect(() => renameTag(db, 'Neon', 'text')).toThrow(/already exists/);
    expect(() => renameTag(db, 'Ghost', 'x')).toThrow(/Ghost/);
  });

  it('deletes a tag scenes still carry, keeping the scenes', () => {
    const db = fresh();
    createTag(db, 'doomed');
    createTag(db, 'kept');
    setSceneTag(db, 'One', 'doomed', true);
    setSceneTag(db, 'Two', 'doomed', true);

    deleteTag(db, 'doomed');

    expect(readTagNames(db)).toEqual(['kept']);
    expect(readScenes(db).map((s) => s.name)).toEqual(['One', 'Two']);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM scene_tags').get() as { n: number };
    expect(n).toBe(0);
  });

  it('leaves ranks dense after a delete, so the next create still lands last', () => {
    const db = fresh();
    createTag(db, 'a');
    createTag(db, 'b');
    createTag(db, 'c');

    deleteTag(db, 'a');
    createTag(db, 'd');

    expect(readTagNames(db)).toEqual(['b', 'c', 'd']);
  });

  it('reorders to the list it is given, and refuses one that is not a permutation', () => {
    const db = fresh();
    createTag(db, 'a');
    createTag(db, 'b');
    createTag(db, 'c');

    setTagOrder(db, ['c', 'a', 'b']);
    expect(readTagNames(db)).toEqual(['c', 'a', 'b']);

    expect(() => setTagOrder(db, ['c', 'a'])).toThrow(/exactly once/);
    expect(() => setTagOrder(db, ['c', 'a', 'a'])).toThrow(/exactly once/);
    expect(() => setTagOrder(db, ['c', 'a', 'ghost'])).toThrow(/exactly once/);
    expect(readTagNames(db)).toEqual(['c', 'a', 'b']);
  });

  it('adds and removes a scene, idempotently in both directions', () => {
    const db = fresh();
    createTag(db, 'neon');

    setSceneTag(db, 'One', 'neon', true);
    setSceneTag(db, 'One', 'neon', true);
    expect(readScenes(db).find((s) => s.name === 'One')?.tags).toEqual(['neon']);

    setSceneTag(db, 'One', 'neon', false);
    setSceneTag(db, 'One', 'neon', false);
    expect(readScenes(db).find((s) => s.name === 'One')?.tags).toEqual([]);
  });

  it('names what is missing rather than failing on a foreign key', () => {
    const db = fresh();
    createTag(db, 'neon');

    expect(() => setSceneTag(db, 'Ghost', 'neon', true)).toThrow(/Ghost/);
    expect(() => setSceneTag(db, 'One', 'ghost', true)).toThrow(/ghost/);
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
    scene('One', { rank: 1 });
    const first = open();
    syncScenes(first, root);
    createTag(first, 'alpha');
    first.exec('DROP TABLE scene_tags; DROP TABLE tags;');
    first.close();
    openDbs = [];

    const second = open();
    syncScenes(second, root);

    expect(readScenes(second)).toEqual(scanSceneFolders(root));
    // The rebuild empties every table, so the reopen looks like a fresh catalog
    // and reseeds. The authored 'alpha' is gone — that path costs authored state
    // by design, `hidden` included.
    expect(readTagNames(second)).not.toContain('alpha');
    expect(readTagNames(second)).toContain('background');
  });
});

describe('setSceneHidden', () => {
  function hiddenNames(db: DatabaseSync): string[] {
    return readScenes(db)
      .filter((scene) => scene.hidden)
      .map((scene) => scene.name);
  }

  it('reads back on the scene it names, and on no other', () => {
    scene('One', { tags: [] });
    scene('Two', { tags: [] });
    const db = open();
    syncScenes(db, root);

    setSceneHidden(db, 'One', true);

    expect(hiddenNames(db)).toEqual(['One']);
  });

  it('unhides again', () => {
    scene('One', { tags: [] });
    const db = open();
    syncScenes(db, root);

    setSceneHidden(db, 'One', true);
    setSceneHidden(db, 'One', false);

    expect(hiddenNames(db)).toEqual([]);
  });

  it('throws on a name no scene carries', () => {
    const db = open();
    syncScenes(db, root);

    expect(() => setSceneHidden(db, 'Ghost', true)).toThrow(/Ghost/);
  });

  it('survives a sync', () => {
    scene('One', { tags: [] });
    scene('Two', { tags: [] });
    const db = open();
    syncScenes(db, root);
    setSceneHidden(db, 'One', true);

    syncScenes(db, root);

    expect(hiddenNames(db)).toEqual(['One']);
  });

  it('survives a sync that rewrote the scene it is set on', () => {
    scene('One', { rank: 1 });
    const db = open();
    syncScenes(db, root);
    setSceneHidden(db, 'One', true);
    createTag(db, 'mine');
    setSceneTag(db, 'One', 'mine', true);

    scene('One', { rank: 900, dark: true });
    syncScenes(db, root);

    expect(readScenes(db)).toEqual([
      expect.objectContaining({
        name: 'One',
        tags: ['mine'],
        rank: 900,
        dark: true,
        hidden: true,
      }),
    ]);
  });

  it('goes with the scene when it vanishes from disk', () => {
    scene('One', { tags: [] });
    const db = open();
    syncScenes(db, root);
    setSceneHidden(db, 'One', true);

    rmSync(join(root, 'One'), { recursive: true, force: true });
    syncScenes(db, root);
    scene('One', { tags: [] });
    syncScenes(db, root);

    expect(hiddenNames(db)).toEqual([]);
  });

  it('survives a reopen', () => {
    scene('One', { tags: [] });
    const first = open();
    syncScenes(first, root);
    setSceneHidden(first, 'One', true);
    first.close();
    openDbs = [];

    const second = open();
    expect(hiddenNames(second)).toEqual(['One']);
  });

  it('is added to a file that predates the column, rows intact', () => {
    const old = new DatabaseSync(dbPath);
    old.exec(`
      CREATE TABLE scenes (
        name TEXT PRIMARY KEY NOT NULL, folder TEXT NOT NULL, rank REAL, dark INTEGER NOT NULL
      );
      CREATE TABLE tags (name TEXT PRIMARY KEY, rank REAL);
      CREATE TABLE scene_tags (scene_name TEXT NOT NULL, tag TEXT NOT NULL);
      INSERT INTO scenes VALUES ('Kept', '/scenes/Kept', 5, 0);
    `);
    old.close();

    const db = open();

    expect(readScenes(db)).toEqual([
      expect.objectContaining({ name: 'Kept', rank: 5, hidden: false }),
    ]);
  });
});
