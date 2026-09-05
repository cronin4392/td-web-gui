import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';
import { sceneFrom, type Catalog, type Scene, type SceneFields } from '../../domain/catalog/scene';
import {
  byName,
  catalogDbPath,
  directoryNames,
  isFile,
  openCatalogDb,
  pruneRows,
  transaction,
  type TableColumns,
} from '../platform/catalog-db';
import { requiredEnv } from '../platform/env';

const TABLE_COLUMNS: TableColumns = {
  scenes: {
    name: 'TEXT PRIMARY KEY NOT NULL',
    folder: 'TEXT NOT NULL',
    rank: 'REAL',
    dark: 'INTEGER NOT NULL',
    hidden: 'INTEGER NOT NULL DEFAULT 0',
  },
  scene_tags: { scene_name: 'TEXT NOT NULL', tag: 'TEXT NOT NULL' },
  tags: { name: 'TEXT PRIMARY KEY', rank: 'REAL' },
};

/** The picker a brand-new catalog opens with, in order. Seeded once, by the
 * migration below — after that they are ordinary tags, free to be renamed,
 * reordered or deleted like any other. */
const SEEDED_TAGS = ['background', 'foreground', 'overlay', 'blank', 'random', 'custom'];

/** How `tags.rank` sorted back when sync owned it: seeded tags took fixed
 * negative/positive slots around an alphabetical, unranked middle. Read once, by
 * the migration, to carry that exact order into dense ranks. */
const LEGACY_TAG_ORDER = `
  SELECT name
    FROM tags
   ORDER BY CASE WHEN rank IS NULL THEN 0 WHEN rank < 0 THEN -1 ELSE 1 END,
            rank,
            name
`;

const META_FILE = 'meta.json';

const DDL = `
  DROP TABLE IF EXISTS scene_tags;
  DROP TABLE IF EXISTS tags;
  DROP TABLE IF EXISTS scenes;
  CREATE TABLE scenes (
    -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
    -- KEY column hold NULL, and any number of them.
    name   TEXT PRIMARY KEY NOT NULL,
    folder TEXT NOT NULL,
    rank   REAL,
    dark   INTEGER NOT NULL,
    -- Authored in the GUI, which is why the sync's upsert never names it.
    hidden INTEGER NOT NULL DEFAULT 0
  );
  -- Authored in the GUI, like scenes.hidden, which is why no sync writes here.
  -- rank is the picker order, kept dense (0..n-1) by every tag mutation.
  CREATE TABLE tags (
    name TEXT PRIMARY KEY,
    rank REAL
  );
  CREATE TABLE scene_tags (
    scene_name TEXT NOT NULL REFERENCES scenes(name) ON DELETE CASCADE,
    tag        TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
    PRIMARY KEY (scene_name, tag)
  );
`;

/** Read by the dev/preview server only — the browser goes through SCENES_ROUTE. */
export function scenesRoot(env: Record<string, string | undefined>): string {
  return requiredEnv(env, 'VJ_SCENES_ROOT');
}

export function scenesDbPath(): string {
  return catalogDbPath('VJ_SCENES_DB', 'scenes.db');
}

export function openScenesDb(path: string): DatabaseSync {
  const db = openCatalogDb(path, TABLE_COLUMNS, DDL);
  transaction(db, () => {
    seedTags(db);
    normalizeTagRanks(db);
  });
  return db;
}

/** Writes `names`' own order into `tags.rank` as 0..n-1. The one place a picker
 * order becomes rank, so every mutation leaves the column dense. */
function writeTagRanks(db: DatabaseSync, names: string[]): void {
  const update = db.prepare('UPDATE tags SET rank = ? WHERE name = ?');
  for (const [index, name] of names.entries()) update.run(index, name);
}

/**
 * The picker a catalog opens with, on a file that has never held one.
 *
 * Keyed on `scenes` being empty as well as `tags`: a catalog is only ever fresh
 * before its first sync, so this cannot fire again later. Keying on an empty
 * `tags` alone would resurrect all six every time the user emptied the rail and
 * the dev server restarted.
 */
function seedTags(db: DatabaseSync): void {
  const { tags, scenes } = db
    .prepare('SELECT (SELECT COUNT(*) FROM tags) AS tags, (SELECT COUNT(*) FROM scenes) AS scenes')
    .get() as { tags: number; scenes: number };
  if (tags > 0 || scenes > 0) return;

  const insert = db.prepare('INSERT INTO tags (name, rank) VALUES (?, ?)');
  for (const [index, name] of SEEDED_TAGS.entries()) insert.run(name, index);
}

/**
 * Back when sync owned `tags.rank`, a discovered tag got a NULL one and sorted
 * in an alphabetical middle that plain `ORDER BY rank` cannot reproduce. Reads
 * that legacy order once and writes it back densely, so the picker looks
 * unchanged across the upgrade.
 *
 * A NULL rank is the whole trigger, which makes this idempotent by construction
 * and self-healing: nothing below ever writes one, so after the first open there
 * is nothing to do, and it would run again correctly on a file rebuilt from the
 * DDL. That is why there is no `user_version` here — `PRAGMA user_version`
 * survives `DROP TABLE`, so a counter would claim to be current over tables that
 * had just been emptied.
 */
function normalizeTagRanks(db: DatabaseSync): void {
  if (db.prepare('SELECT 1 FROM tags WHERE rank IS NULL LIMIT 1').get() === undefined) return;
  writeTagRanks(
    db,
    (db.prepare(LEGACY_TAG_ORDER).all() as { name: string }[]).map((row) => row.name),
  );
}

function parseMeta(raw: string, folderName: string): Omit<SceneFields, 'name' | 'folder'> {
  let parsed: unknown;
  try {
    // Node's utf8 read keeps a BOM and JSON.parse chokes on it; these files are
    // hand-edited on Windows, where a BOM is the editor default.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new Error(`${folderName}/${META_FILE} is not valid JSON: ${String(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${folderName}/${META_FILE} is not a JSON object`);
  }

  // `meta.tags` is deliberately not read: tags are authored in the GUI now, so
  // the key is inert and a Scan reports no tags at all.
  const meta = parsed as Record<string, unknown>;
  return {
    rank: typeof meta.rank === 'number' && Number.isFinite(meta.rank) ? meta.rank : null,
    dark: meta.dark === true,
  };
}

/** Highest rank first; an absent rank sorts below every ranked scene. Ties break
 * on name, so a scan and a read agree without the rows carrying an order. */
function byRank(a: { rank: number | null; name: string }, b: typeof a): number {
  if (a.rank === null || b.rank === null) {
    if (a.rank === b.rank) return byName(a, b);
    return a.rank === null ? 1 : -1;
  }
  return b.rank - a.rank || byName(a, b);
}

/**
 * A folder counts as a scene only when it holds both a `meta.json` and a
 * matching `<name>.tox`, which is what keeps archives (`_other/`) and
 * half-deleted folders out of the catalog. Throws on a malformed `meta.json`
 * rather than silently dropping the scene.
 */
function scanSceneFields(root: string): SceneFields[] {
  const base = resolve(root).replace(/\\/g, '/');

  const fields: SceneFields[] = [];
  for (const name of directoryNames(base)) {
    const folder = `${base}/${name}`;
    const metaPath = join(folder, META_FILE);
    if (!isFile(metaPath) || !isFile(join(folder, `${name}.tox`))) continue;
    // Relative to the root: the absolute path is this machine's, and the catalog is tracked.
    fields.push({ name, folder: name, ...parseMeta(readFileSync(metaPath, 'utf8'), name) });
  }
  return fields.sort(byRank);
}

export function scanSceneFolders(root: string): Scene[] {
  return scanSceneFields(root).map((fields) =>
    sceneFrom({ ...fields, folder: resolve(root, fields.folder) }),
  );
}

/**
 * Reconcile the catalog against disk in one transaction — the whole scan or none
 * of it. Scanning happens first so a malformed `meta.json` leaves the prior
 * catalog serving rather than emptying it.
 *
 * Neither tag table is touched. Both hold authored state now, so a sync leaves
 * them exactly as the GUI left them; the only tag rows a sync can remove are the
 * ones a pruned scene takes with it through `scene_tags`' cascade.
 */
export function syncScenes(db: DatabaseSync, root: string): { scenes: number } {
  const scenes = scanSceneFields(root);

  return transaction(db, () => {
    // Naming every scanned column and no authored one is what carries `hidden`
    // through a sync: a scene that is still on disk keeps the row it had.
    const upsertScene = db.prepare(`
      INSERT INTO scenes (name, folder, rank, dark) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET folder = excluded.folder,
                                      rank   = excluded.rank,
                                      dark   = excluded.dark
    `);
    for (const scene of scenes) {
      upsertScene.run(scene.name, scene.folder, scene.rank, scene.dark ? 1 : 0);
    }
    pruneRows(db, 'scenes', new Set(scenes.map((scene) => scene.name)));

    return { scenes: scenes.length };
  });
}

/** Throws on a name no scene carries: the picker only ever names a scene it just
 * rendered, so a miss means the catalog moved under it — worth surfacing. */
export function setSceneHidden(db: DatabaseSync, name: string, hidden: boolean): void {
  const { changes } = db
    .prepare('UPDATE scenes SET hidden = ? WHERE name = ?')
    .run(hidden ? 1 : 0, name);
  if (changes === 0) throw new Error(`no such scene "${name}"`);
}

export function readScenes(db: DatabaseSync, root: string): Scene[] {
  const rows = (
    db.prepare('SELECT name, folder, rank, dark, hidden FROM scenes').all() as {
      name: string;
      folder: string;
      rank: number | null;
      dark: number;
      hidden: number;
    }[]
  ).sort(byRank);

  const tags = new Map<string, string[]>();
  const tagRows = db
    .prepare('SELECT scene_name, tag FROM scene_tags ORDER BY scene_name, tag')
    .all() as { scene_name: string; tag: string }[];
  for (const row of tagRows) {
    const existing = tags.get(row.scene_name);
    if (existing) existing.push(row.tag);
    else tags.set(row.scene_name, [row.tag]);
  }

  return rows.map((row) =>
    sceneFrom({
      name: row.name,
      folder: resolve(root, row.folder),
      tags: tags.get(row.name) ?? [],
      rank: row.rank,
      dark: row.dark !== 0,
      hidden: row.hidden !== 0,
    }),
  );
}

/** Every known tag in picker order. A tag no scene carries is still listed — it
 * just filters down to an empty grid. `name` breaks a tie only in a file whose
 * ranks were hand-edited; the mutations below keep them dense and distinct. */
export function readTagNames(db: DatabaseSync): string[] {
  const rows = db.prepare('SELECT name FROM tags ORDER BY rank, name').all() as { name: string }[];
  return rows.map((row) => row.name);
}

function tagName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('a tag needs a name');
  return trimmed;
}

function hasTag(db: DatabaseSync, name: string): boolean {
  return db.prepare('SELECT 1 FROM tags WHERE name = ?').get(name) !== undefined;
}

/** `name` is a BINARY-collated primary key, so `Blank` and `blank` are two rows
 * that look like one in the rail. A NOCASE unique index can't be added without a
 * table rebuild that would cost every authored column, so the rule lives here. */
function clashingTag(db: DatabaseSync, name: string): string | undefined {
  const row = db.prepare('SELECT name FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    { name: string } | undefined;
  return row?.name;
}

/** Appended last, where the picker's `+` button sits. */
export function createTag(db: DatabaseSync, name: string): void {
  const tag = tagName(name);
  transaction(db, () => {
    const clash = clashingTag(db, tag);
    if (clash !== undefined) throw new Error(`tag "${clash}" already exists`);
    const { next } = db.prepare('SELECT COALESCE(MAX(rank) + 1, 0) AS next FROM tags').get() as {
      next: number;
    };
    db.prepare('INSERT INTO tags (name, rank) VALUES (?, ?)').run(tag, next);
  });
}

/** Rejects a collision rather than merging the two tags — a merge loses which
 * scenes came from where, and nothing in the picker asks for one. */
export function renameTag(db: DatabaseSync, name: string, to: string): void {
  const target = tagName(to);
  transaction(db, () => {
    const row = db.prepare('SELECT rank FROM tags WHERE name = ?').get(name) as
      { rank: number | null } | undefined;
    if (!row) throw new Error(`no such tag "${name}"`);
    if (target === name) return;
    const clash = clashingTag(db, target);
    // A pure change of case is a rename onto itself, not a collision.
    if (clash !== undefined && clash !== name) throw new Error(`tag "${clash}" already exists`);

    // Insert before repoint before delete, so `scene_tags`' foreign key holds at
    // every step — the alternative would be an ON UPDATE CASCADE this schema
    // can't gain without a rebuild that would cost every authored column.
    db.prepare('INSERT INTO tags (name, rank) VALUES (?, ?)').run(target, row.rank);
    db.prepare('UPDATE scene_tags SET tag = ? WHERE tag = ?').run(target, name);
    db.prepare('DELETE FROM tags WHERE name = ?').run(name);
  });
}

/** The scenes stay; only their membership goes. Deleting a tag scenes still
 * carry is a supported move, not a mistake. */
export function deleteTag(db: DatabaseSync, name: string): void {
  transaction(db, () => {
    // `scene_tags` would cascade, but only if this file's foreign key survived —
    // the schema check compares columns and cannot see a constraint, so the
    // links are cleared outright rather than trusted to a property nothing here
    // can verify.
    db.prepare('DELETE FROM scene_tags WHERE tag = ?').run(name);
    const { changes } = db.prepare('DELETE FROM tags WHERE name = ?').run(name);
    if (changes === 0) throw new Error(`no such tag "${name}"`);
    writeTagRanks(db, readTagNames(db));
  });
}

/** Takes the whole list rather than a from/to pair: the picker already knows the
 * order it wants, and a full list can't drift out of step with the catalog. */
export function setTagOrder(db: DatabaseSync, names: string[]): void {
  transaction(db, () => {
    const current = readTagNames(db);
    if (names.length !== current.length || !current.every((name) => names.includes(name))) {
      throw new Error('tag order must list every tag exactly once');
    }
    // `rank` carries no UNIQUE constraint, so renumbering in place needs no
    // two-pass shuffle around a collision that cannot happen.
    writeTagRanks(db, names);
  });
}

/** Untagging a scene that never carried the tag is a no-op — a drag can land on
 * a stale view, and there is nothing to tell the user about. */
export function setSceneTag(db: DatabaseSync, scene: string, tag: string, tagged: boolean): void {
  transaction(db, () => {
    if (!hasTag(db, tag)) throw new Error(`no such tag "${tag}"`);
    if (!tagged) {
      db.prepare('DELETE FROM scene_tags WHERE scene_name = ? AND tag = ?').run(scene, tag);
      return;
    }
    if (db.prepare('SELECT 1 FROM scenes WHERE name = ?').get(scene) === undefined) {
      throw new Error(`no such scene "${scene}"`);
    }
    db.prepare('INSERT OR IGNORE INTO scene_tags (scene_name, tag) VALUES (?, ?)').run(scene, tag);
  });
}

export function readCatalog(db: DatabaseSync, root: string): Catalog {
  return { scenes: readScenes(db, root), tags: readTagNames(db) };
}
