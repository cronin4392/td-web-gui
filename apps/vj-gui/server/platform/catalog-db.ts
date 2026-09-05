import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';

/** Each table's columns, mapped to the SQL that declares one — enough for the
 * schema check to add a missing column rather than rebuild the table. */
export type TableColumns = Record<string, Record<string, string>>;

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

/** Keeps the `.db` whole for anything copying it without going through SQLite;
 * PASSIVE and failure-ignoring because the write itself already succeeded. */
export function checkpointWal(db: DatabaseSync): void {
  try {
    db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
  } catch {
    // Best effort by design — see above.
  }
}

/** `data/snapshots/` is tracked, so its absence means the cwd is wrong rather
 * than the database being new — the one case worth refusing rather than seeding. */
export function catalogDbPath(envVar: string, filename: string): string {
  const override = process.env[envVar];
  if (override) return resolve(override);
  const dir = resolve(process.cwd(), 'data');
  if (!existsSync(join(dir, 'snapshots'))) {
    throw new Error(
      `No snapshots directory under ${dir}. Run this from apps/vj-gui, or set ${envVar} to the database path.`,
    );
  }
  return join(dir, filename);
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((row) => row.name);
}

/** Adds any column the live file is missing, in place. Answers false when the
 * drift needs the rebuild instead — a table that isn't there, or a column the DDL
 * no longer declares. That is the one path that costs authored state. */
function addMissingColumns(db: DatabaseSync, tableColumns: TableColumns): boolean {
  for (const [table, columns] of Object.entries(tableColumns)) {
    const actual = columnsOf(db, table);
    if (actual.length === 0) return false;
    if (actual.some((name) => !(name in columns))) return false;

    for (const [name, definition] of Object.entries(columns)) {
      if (actual.includes(name)) continue;
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      } catch {
        // SQLite refuses some additions outright, a PRIMARY KEY among them.
        return false;
      }
    }
  }
  return true;
}

/**
 * A catalog row is mostly rederivable from the folders on disk, but not wholly —
 * `hidden` is authored in the GUI — so a stale schema is grown into the current
 * one where that is possible: a column the file lacks is added in place. Only
 * drift `ALTER TABLE` can't express falls back to `ddl`, which drops and
 * recreates and takes the authored columns with it. `ddl` carries its own `DROP
 * TABLE` statements so each schema states its own drop order, which foreign keys
 * make load-bearing. The check reads the live columns instead of a
 * `user_version` counter, so a file whose version says one thing and whose
 * tables say another still self-heals.
 */
export function openCatalogDb(path: string, tableColumns: TableColumns, ddl: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  if (!addMissingColumns(db, tableColumns)) transaction(db, () => db.exec(ddl));
  return db;
}

/** Deletes the rows a Scan no longer found. Catalogs run to hundreds of rows, so
 * this reads the names back rather than building an `IN (?, ?, …)` list. */
export function pruneRows(db: DatabaseSync, table: string, keep: Set<string>): void {
  const rows = db.prepare(`SELECT name FROM ${table}`).all() as { name: string }[];
  const remove = db.prepare(`DELETE FROM ${table} WHERE name = ?`);
  for (const row of rows) if (!keep.has(row.name)) remove.run(row.name);
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

/** The one catalog comparator: a scan and a read must sort through the same
 * function, never once here and once in an `ORDER BY`. No SQLite collation
 * matches `localeCompare` — BINARY sorts every capital ahead of every
 * lowercase, and NOCASE still strands non-ascii names at the end. */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
