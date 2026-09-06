// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openEffectsDb,
  readEffects,
  scanEffectFolders,
  setEffectFavorite,
  setEffectHidden,
  syncEffects,
} from './effects-db';

let dir: string;
let root: string;
let dbPath: string;
let openDbs: DatabaseSync[] = [];

function open(): DatabaseSync {
  const db = openEffectsDb(dbPath);
  openDbs.push(db);
  return db;
}

function effect(group: string, name: string, options: { tox?: boolean } = {}): void {
  const folder = join(root, group, name);
  mkdirSync(folder, { recursive: true });
  if (options.tox !== false) writeFileSync(join(folder, `${name}.tox`), '');
}

function toxPathOf(group: string, name: string): string {
  return `${root.replace(/\\/g, '/')}/${group}/${name}/${name}.tox`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-effects-db-'));
  root = join(dir, 'Effects');
  dbPath = join(dir, 'effects.db');
  mkdirSync(root, { recursive: true });
  openDbs = [];
});

afterEach(() => {
  for (const db of openDbs) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('scanEffectFolders', () => {
  it('reads an effect from the second level, dropping the group folder', () => {
    effect('3 Effect', 'Blur');

    expect(scanEffectFolders(root)).toEqual([
      { name: 'Blur', hidden: false, favorite: false, path: toxPathOf('3 Effect', 'Blur') },
    ]);
  });

  it('skips a folder with no matching tox', () => {
    effect('3 Effect', 'Kept');
    effect('_other', 'archive', { tox: false });

    expect(scanEffectFolders(root).map((e) => e.name)).toEqual(['Kept']);
  });

  it('ignores a tox nested below the second level', () => {
    effect('_other/archive', 'Retired');

    expect(scanEffectFolders(root)).toEqual([]);
  });

  it('ignores a tox whose name does not match its folder', () => {
    mkdirSync(join(root, '3 Effect', 'Mismatch'), { recursive: true });
    writeFileSync(join(root, '3 Effect', 'Mismatch', 'Something.tox'), '');

    expect(scanEffectFolders(root)).toEqual([]);
  });

  it('sorts by name across groups, ignoring which group an effect came from', () => {
    effect('4 3D', 'Tube');
    effect('1 Flashing', 'Flashing');
    effect('3 Effect', 'Blur');

    expect(scanEffectFolders(root).map((e) => e.name)).toEqual(['Blur', 'Flashing', 'Tube']);
  });

  it('does not leak the on-disk folder or a scene-only field into the catalog', () => {
    effect('3 Effect', 'Blur');

    const scanned = scanEffectFolders(root)[0]!;
    expect(scanned).not.toHaveProperty('folder');
    expect(scanned).not.toHaveProperty('tags');
    expect(scanned).not.toHaveProperty('rank');
  });

  it('throws naming both folders when two groups hold the same effect name', () => {
    effect('1 Flashing', 'Twin');
    effect('3 Effect', 'Twin');

    expect(() => scanEffectFolders(root)).toThrow(/Twin/);
  });

  it('throws when the root does not exist', () => {
    expect(() => scanEffectFolders(join(dir, 'nope'))).toThrow();
  });
});

describe('syncEffects', () => {
  it('round-trips the scan through the database, order intact', () => {
    effect('4 3D', 'Tube');
    effect('3 Effect', 'Blur');

    const db = open();
    expect(syncEffects(db, root)).toEqual({ effects: 2 });
    expect(readEffects(db, root)).toEqual(scanEffectFolders(root));
  });

  it('stores the folder relative to the root and joins it back on read', () => {
    effect('1 Flashing', 'Drifter');
    const db = open();

    syncEffects(db, root);

    expect(db.prepare('SELECT folder FROM effects').all()).toEqual([
      { folder: '1 Flashing/Drifter' },
    ]);
    expect(readEffects(db, root)[0]?.path).toBe(toxPathOf('1 Flashing', 'Drifter'));
  });

  it('sorts mixed-case and non-ascii names through the scan comparator, not SQLite collation', () => {
    effect('3 Effect', 'apple');
    effect('3 Effect', 'Banana');
    effect('3 Effect', 'Ähnlich');

    const db = open();
    syncEffects(db, root);

    expect(readEffects(db, root)).toEqual(scanEffectFolders(root));
    expect(readEffects(db, root).map((e) => e.name)).toEqual(['Ähnlich', 'apple', 'Banana']);
  });

  it('is deterministic — a second run leaves the same rows', () => {
    effect('3 Effect', 'Blur');
    effect('4 3D', 'Tube');

    const db = open();
    const first = syncEffects(db, root);
    const before = readEffects(db, root);
    expect(syncEffects(db, root)).toEqual(first);
    expect(readEffects(db, root)).toEqual(before);
  });

  it('drops effects that vanished from disk', () => {
    effect('3 Effect', 'Doomed');
    effect('3 Effect', 'Survivor');

    const db = open();
    syncEffects(db, root);
    rmSync(join(root, '3 Effect', 'Doomed'), { recursive: true, force: true });
    syncEffects(db, root);

    expect(readEffects(db, root).map((e) => e.name)).toEqual(['Survivor']);
  });

  it('leaves the prior catalog serving when the next scan fails', () => {
    effect('3 Effect', 'Good');
    const db = open();
    syncEffects(db, root);

    effect('1 Flashing', 'Good');
    expect(() => syncEffects(db, root)).toThrow();
    expect(readEffects(db, root).map((e) => e.name)).toEqual(['Good']);
  });

  it('follows an effect that moved to another group', () => {
    effect('1 Flashing', 'Drifter');
    const db = open();
    syncEffects(db, root);
    expect(readEffects(db, root)[0]?.path).toBe(toxPathOf('1 Flashing', 'Drifter'));

    rmSync(join(root, '1 Flashing'), { recursive: true, force: true });
    effect('3 Effect', 'Drifter');
    syncEffects(db, root);

    expect(readEffects(db, root)[0]?.path).toBe(toxPathOf('3 Effect', 'Drifter'));
  });
});

describe('schema', () => {
  it('rebuilds a stale schema even when user_version claims to be current', () => {
    const stale = new DatabaseSync(dbPath);
    stale.exec(`
      CREATE TABLE effects (name TEXT PRIMARY KEY, folder TEXT NOT NULL, tags TEXT NOT NULL);
      INSERT INTO effects VALUES ('Ghost', '/gone', 'overlay');
      PRAGMA user_version = 99;
    `);
    stale.close();

    effect('3 Effect', 'Fresh');
    const db = open();
    syncEffects(db, root);

    expect(readEffects(db, root).map((e) => e.name)).toEqual(['Fresh']);
  });

  it('rejects a duplicate or null name, backstopping the scan', () => {
    const db = open();
    const insert = db.prepare('INSERT INTO effects (name, folder) VALUES (?, ?)');
    insert.run('Blur', '/a');

    expect(() => insert.run('Blur', '/b')).toThrow(/UNIQUE/);
    expect(() => insert.run(null, '/c')).toThrow(/NOT NULL/);
  });

  it('reopens without losing rows', () => {
    effect('3 Effect', 'Blur');

    const first = open();
    syncEffects(first, root);
    first.close();
    openDbs = [];

    const second = open();
    expect(readEffects(second, root).map((e) => e.name)).toEqual(['Blur']);
  });
});

describe('setEffectHidden', () => {
  function hiddenNames(db: DatabaseSync): string[] {
    return readEffects(db, root)
      .filter((entry) => entry.hidden)
      .map((entry) => entry.name);
  }

  it('reads back on the effect it names, and on no other', () => {
    effect('3 Effect', 'Blur');
    effect('4 3D', 'Tube');
    const db = open();
    syncEffects(db, root);

    setEffectHidden(db, 'Blur', true);

    expect(hiddenNames(db)).toEqual(['Blur']);
  });

  it('unhides again', () => {
    effect('3 Effect', 'Blur');
    const db = open();
    syncEffects(db, root);

    setEffectHidden(db, 'Blur', true);
    setEffectHidden(db, 'Blur', false);

    expect(hiddenNames(db)).toEqual([]);
  });

  it('throws on a name no effect carries', () => {
    const db = open();
    syncEffects(db, root);

    expect(() => setEffectHidden(db, 'Ghost', true)).toThrow(/Ghost/);
  });

  it('survives a sync', () => {
    effect('3 Effect', 'Blur');
    effect('4 3D', 'Tube');
    const db = open();
    syncEffects(db, root);
    setEffectHidden(db, 'Blur', true);

    syncEffects(db, root);

    expect(hiddenNames(db)).toEqual(['Blur']);
  });

  it('follows an effect that moved to another group', () => {
    effect('1 Flashing', 'Drifter');
    const db = open();
    syncEffects(db, root);
    setEffectHidden(db, 'Drifter', true);

    rmSync(join(root, '1 Flashing'), { recursive: true, force: true });
    effect('3 Effect', 'Drifter');
    syncEffects(db, root);

    expect(readEffects(db, root)).toEqual([
      expect.objectContaining({ path: toxPathOf('3 Effect', 'Drifter'), hidden: true }),
    ]);
  });

  it('goes with the effect when it vanishes from disk', () => {
    effect('3 Effect', 'Blur');
    const db = open();
    syncEffects(db, root);
    setEffectHidden(db, 'Blur', true);

    rmSync(join(root, '3 Effect'), { recursive: true, force: true });
    syncEffects(db, root);
    effect('3 Effect', 'Blur');
    syncEffects(db, root);

    expect(hiddenNames(db)).toEqual([]);
  });

  it('survives a reopen', () => {
    effect('3 Effect', 'Blur');
    const first = open();
    syncEffects(first, root);
    setEffectHidden(first, 'Blur', true);
    first.close();
    openDbs = [];

    const second = open();
    expect(hiddenNames(second)).toEqual(['Blur']);
  });

  it('is added to a file that predates the column, rows intact', () => {
    const old = new DatabaseSync(dbPath);
    old.exec(`
      CREATE TABLE effects (name TEXT PRIMARY KEY NOT NULL, folder TEXT NOT NULL);
      INSERT INTO effects VALUES ('Kept', '/effects/3 Effect/Kept');
    `);
    old.close();

    const db = open();

    expect(readEffects(db, root)).toEqual([
      expect.objectContaining({ name: 'Kept', hidden: false }),
    ]);
  });
});

describe('setEffectFavorite', () => {
  function favoriteNames(db: DatabaseSync): string[] {
    return readEffects(db, root)
      .filter((entry) => entry.favorite)
      .map((entry) => entry.name);
  }

  it('reads back on the effect it names, and on no other', () => {
    effect('3 Effect', 'Blur');
    effect('4 3D', 'Tube');
    const db = open();
    syncEffects(db, root);

    setEffectFavorite(db, 'Blur', true);

    expect(favoriteNames(db)).toEqual(['Blur']);
  });

  it('unfavorites again', () => {
    effect('3 Effect', 'Blur');
    const db = open();
    syncEffects(db, root);

    setEffectFavorite(db, 'Blur', true);
    setEffectFavorite(db, 'Blur', false);

    expect(favoriteNames(db)).toEqual([]);
  });

  it('throws on a name no effect carries', () => {
    const db = open();
    syncEffects(db, root);

    expect(() => setEffectFavorite(db, 'Ghost', true)).toThrow(/Ghost/);
  });

  it('leaves hidden alone, and survives a sync alongside it', () => {
    effect('3 Effect', 'Blur');
    const db = open();
    syncEffects(db, root);

    setEffectFavorite(db, 'Blur', true);
    setEffectHidden(db, 'Blur', true);
    syncEffects(db, root);

    expect(readEffects(db, root)).toEqual([
      expect.objectContaining({ name: 'Blur', hidden: true, favorite: true }),
    ]);
  });

  it('is added to a file that predates the column, hidden intact', () => {
    const old = new DatabaseSync(dbPath);
    old.exec(`
      CREATE TABLE effects (
        name   TEXT PRIMARY KEY NOT NULL,
        folder TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO effects VALUES ('Kept', '/effects/3 Effect/Kept', 1);
    `);
    old.close();

    const db = open();

    expect(readEffects(db, root)).toEqual([
      expect.objectContaining({ name: 'Kept', hidden: true, favorite: false }),
    ]);
  });
});
