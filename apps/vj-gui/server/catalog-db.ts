import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';

export function transaction<T>(db: DatabaseSync, work: () => T): T {
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

/** `data/<filename>` under the package root, or `envVar` when set. Both `pnpm
 * dev` and the `db:*` scripts are run from `apps/vj-gui`, so cwd is the one
 * derivation — a second one could point a CLI at a different file. */
export function catalogDbPath(envVar: string, filename: string): string {
  const override = process.env[envVar];
  return override ? resolve(override) : resolve(process.cwd(), 'data', filename);
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

function schemaIsCurrent(db: DatabaseSync, tableColumns: Record<string, string[]>): boolean {
  return Object.entries(tableColumns).every(([table, expected]) => {
    const actual = columnsOf(db, table);
    return actual.length === expected.length && expected.every((name) => actual.includes(name));
  });
}

/**
 * Every row is rederivable from the folders on disk, so a stale schema is
 * dropped and rebuilt rather than migrated in place — the next sync refills it.
 * `ddl` carries its own `DROP TABLE` statements so each schema states its own
 * drop order, which foreign keys make load-bearing. The check reads the live
 * columns instead of a `user_version` counter, so a file whose version says one
 * thing and whose tables say another still self-heals.
 */
export function openCatalogDb(
  path: string,
  tableColumns: Record<string, string[]>,
  ddl: string,
): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  if (!schemaIsCurrent(db, tableColumns)) transaction(db, () => db.exec(ddl));
  return db;
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function directoryNames(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The scan owns catalog order and the `position` column replays it; sorting
 * again in SQL would reorder under a collation the scan's comparator does not
 * share. */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
