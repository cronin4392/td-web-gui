import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve, join } from 'node:path';
import { effectFrom, type Effect, type EffectCatalog, type EffectFields } from '../src/effects';

const TABLE_COLUMNS: Record<string, string[]> = {
  effects: ['name', 'folder', 'position'],
};

/** Read by the dev/preview server only — effects have no browser-facing assets,
 * so unlike the scene library this root never reaches the client. */
export function effectsRoot(env: Record<string, string | undefined>): string {
  return (
    env.VJ_EFFECTS_ROOT ?? 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280'
  );
}

/** `data/effects.db` under the package root, or `VJ_EFFECTS_DB` when set. */
export function effectsDbPath(): string {
  const override = process.env.VJ_EFFECTS_DB;
  return override ? resolve(override) : resolve(process.cwd(), 'data', 'effects.db');
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

export function openEffectsDb(path: string): DatabaseSync {
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
 * Every row is rederivable from the effect folders, so a stale schema is dropped
 * and rebuilt rather than migrated in place — the next sync refills it. The
 * check reads the live columns instead of a `user_version` counter, so a file
 * whose version says one thing and whose tables say another still self-heals.
 */
function migrate(db: DatabaseSync): void {
  if (schemaIsCurrent(db)) return;

  transaction(db, () => {
    db.exec(`
      DROP TABLE IF EXISTS effects;
      CREATE TABLE effects (
        -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
        -- KEY column hold NULL, and any number of them.
        name     TEXT PRIMARY KEY NOT NULL,
        folder   TEXT NOT NULL,
        -- The scan owns catalog order; this replays it. Sorting again in SQL
        -- would reorder under a collation the scan's comparator doesn't share.
        position INTEGER NOT NULL
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

function directoryNames(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** Flattening two levels into one name-keyed catalog makes a collision possible,
 * so it is named rather than left to surface as a UNIQUE constraint failure. */
function assertNamesAreUnique(fields: EffectFields[]): void {
  const seen = new Map<string, string>();
  for (const { name, folder } of fields) {
    const first = seen.get(name);
    if (first) throw new Error(`duplicate effect name "${name}": ${first} and ${folder}`);
    seen.set(name, folder);
  }
}

/**
 * Effects sit two levels down, under the group folder that used to carry their
 * tag; the catalog deliberately drops that level. A folder counts as an effect
 * only when it holds a matching `<name>.tox`, which is what keeps archives
 * (`_other/`) and half-deleted folders out.
 */
function scanEffectFields(root: string): EffectFields[] {
  const base = resolve(root).replace(/\\/g, '/');

  const fields: EffectFields[] = [];
  for (const group of directoryNames(base)) {
    for (const name of directoryNames(`${base}/${group}`)) {
      const folder = `${base}/${group}/${name}`;
      if (!isFile(join(folder, `${name}.tox`))) continue;
      fields.push({ name, folder });
    }
  }

  fields.sort((a, b) => a.name.localeCompare(b.name));
  assertNamesAreUnique(fields);
  return fields;
}

export function scanEffectFolders(root: string): EffectCatalog {
  return scanEffectFields(root).map(effectFrom);
}

/** Rebuild the catalog from disk in one transaction — the whole scan or none of
 * it. Scanning happens first so a failed scan leaves the prior catalog serving
 * rather than emptying it. */
export function syncEffects(db: DatabaseSync, root: string): { effects: number } {
  const effects = scanEffectFields(root);

  return transaction(db, () => {
    db.exec('DELETE FROM effects');
    const insert = db.prepare('INSERT INTO effects (name, folder, position) VALUES (?, ?, ?)');
    for (const [position, effect] of effects.entries()) {
      insert.run(effect.name, effect.folder, position);
    }
    return { effects: effects.length };
  });
}

export function readEffects(db: DatabaseSync): EffectCatalog {
  const rows = db.prepare('SELECT name, folder FROM effects ORDER BY position').all() as {
    name: string;
    folder: string;
  }[];
  return rows.map((row): Effect => effectFrom(row));
}
