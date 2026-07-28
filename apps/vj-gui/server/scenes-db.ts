import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve, join } from 'node:path';
import { sceneFrom, type Catalog, type Scene, type SceneFields } from '../src/scenes';

const TABLE_COLUMNS: Record<string, string[]> = {
  scenes: ['name', 'folder', 'rank', 'dark'],
  scene_tags: ['scene_name', 'tag'],
  tags: ['name', 'rank'],
};

/** Ranks for the tags that get a fixed slot in the picker. Negative sorts above
 * the alphabetical middle, positive below; the gaps leave room to slot a tag in
 * without renumbering. Every one of these gets a row whether or not a scene
 * carries it, so a seeded tag still shows up in an empty picker. */
const SEEDED_TAG_RANKS: Record<string, number> = {
  background: -400,
  foreground: -300,
  overlay: -200,
  blank: -100,
  random: 100,
  custom: 200,
};

const META_FILE = 'meta.json';

/** `data/scenes.db` under the package root, or `VJ_SCENES_DB` when set. Both
 * `pnpm dev` and `pnpm db:scenes` are run from `apps/vj-gui`, so cwd is the one
 * derivation — a second one could point the CLI at a different file. */
export function scenesDbPath(): string {
  const override = process.env.VJ_SCENES_DB;
  return override ? resolve(override) : resolve(process.cwd(), 'data', 'scenes.db');
}

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function openScenesDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function schemaIsCurrent(db: DatabaseSync): boolean {
  return Object.entries(TABLE_COLUMNS).every(([table, expected]) => {
    const actual = columnsOf(db, table);
    return actual.length === expected.length && expected.every((name) => actual.includes(name));
  });
}

/**
 * Every row is rederivable from the scene folders, so a stale schema is dropped
 * and rebuilt rather than migrated in place — the next sync refills it. The
 * check reads the live columns instead of a `user_version` counter, so a file
 * whose version says one thing and whose tables say another still self-heals.
 */
function migrate(db: DatabaseSync): void {
  if (schemaIsCurrent(db)) return;

  transaction(db, () => {
    db.exec(`
      DROP TABLE IF EXISTS scene_tags;
      DROP TABLE IF EXISTS tags;
      DROP TABLE IF EXISTS scenes;
      CREATE TABLE scenes (
        name   TEXT PRIMARY KEY,
        folder TEXT NOT NULL,
        rank   REAL,
        dark   INTEGER NOT NULL
      );
      CREATE TABLE tags (
        name TEXT PRIMARY KEY,
        rank REAL
      );
      CREATE TABLE scene_tags (
        scene_name TEXT NOT NULL REFERENCES scenes(name) ON DELETE CASCADE,
        tag        TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
        PRIMARY KEY (scene_name, tag)
      );
    `);
  });
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Sorted, so a scan and a read agree without the rows carrying an order. */
function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const tag = entry.trim();
    if (tag) tags.add(tag);
  }
  return [...tags].sort();
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

  const meta = parsed as Record<string, unknown>;
  return {
    tags: readTags(meta.tags),
    rank: typeof meta.rank === 'number' && Number.isFinite(meta.rank) ? meta.rank : null,
    dark: meta.dark === true,
  };
}

/** Highest rank first; an absent rank sorts below every ranked scene. */
function byRank(a: { rank: number | null; name: string }, b: typeof a): number {
  if (a.rank === null || b.rank === null) {
    if (a.rank === b.rank) return a.name.localeCompare(b.name);
    return a.rank === null ? 1 : -1;
  }
  return b.rank - a.rank || a.name.localeCompare(b.name);
}

/**
 * A folder counts as a scene only when it holds both a `meta.json` and a
 * matching `<name>.tox`, which is what keeps archives (`_other/`) and
 * half-deleted folders out of the catalog. Throws on a malformed `meta.json`
 * rather than silently dropping the scene.
 */
function scanSceneFields(root: string): SceneFields[] {
  const base = resolve(root).replace(/\\/g, '/');
  const names = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const fields: SceneFields[] = [];
  for (const name of names) {
    const folder = `${base}/${name}`;
    const metaPath = join(folder, META_FILE);
    if (!isFile(metaPath) || !isFile(join(folder, `${name}.tox`))) continue;
    fields.push({ name, folder, ...parseMeta(readFileSync(metaPath, 'utf8'), name) });
  }
  return fields.sort(byRank);
}

export function scanSceneFolders(root: string): Scene[] {
  return scanSceneFields(root).map(sceneFrom);
}

/** Rebuild the catalog from disk in one transaction — the whole scan or none of
 * it. Scanning happens first so a malformed `meta.json` leaves the prior
 * catalog serving rather than emptying it. */
export function syncScenes(db: DatabaseSync, root: string): { scenes: number; tags: number } {
  const scenes = scanSceneFields(root);
  const tagNames = new Set([
    ...Object.keys(SEEDED_TAG_RANKS),
    ...scenes.flatMap((scene) => scene.tags),
  ]);

  return transaction(db, () => {
    db.exec('DELETE FROM scene_tags');
    db.exec('DELETE FROM tags');
    db.exec('DELETE FROM scenes');

    const insertTag = db.prepare('INSERT INTO tags (name, rank) VALUES (?, ?)');
    for (const name of [...tagNames].sort()) insertTag.run(name, SEEDED_TAG_RANKS[name] ?? null);

    const insertScene = db.prepare(
      'INSERT INTO scenes (name, folder, rank, dark) VALUES (?, ?, ?, ?)',
    );
    const insertSceneTag = db.prepare('INSERT INTO scene_tags (scene_name, tag) VALUES (?, ?)');

    let tags = 0;
    for (const scene of scenes) {
      insertScene.run(scene.name, scene.folder, scene.rank, scene.dark ? 1 : 0);
      for (const tag of scene.tags) {
        insertSceneTag.run(scene.name, tag);
        tags += 1;
      }
    }
    return { scenes: scenes.length, tags };
  });
}

export function readScenes(db: DatabaseSync): Scene[] {
  const rows = db
    .prepare('SELECT name, folder, rank, dark FROM scenes ORDER BY rank IS NULL, rank DESC, name')
    .all() as { name: string; folder: string; rank: number | null; dark: number }[];

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
      folder: row.folder,
      tags: tags.get(row.name) ?? [],
      rank: row.rank,
      dark: row.dark !== 0,
    }),
  );
}

/**
 * Every known tag in picker order: negative ranks first, then the unranked
 * alphabetically, then positive ranks. A tag no scene carries is still listed —
 * it just filters down to an empty grid.
 */
export function readTagNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT name
         FROM tags
        ORDER BY CASE WHEN rank IS NULL THEN 0 WHEN rank < 0 THEN -1 ELSE 1 END,
                 rank,
                 name`,
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

export function readCatalog(db: DatabaseSync): Catalog {
  return { scenes: readScenes(db), tags: readTagNames(db) };
}
