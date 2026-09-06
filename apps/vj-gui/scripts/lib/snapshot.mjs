import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function ident(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

export function normaliseRoot(root) {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function sortRoots(roots) {
  return [...roots]
    .map(normaliseRoot)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

// Case-insensitive: these are Windows paths, so the root and the scanned value can differ in case.
function relativise(value, roots) {
  if (typeof value !== 'string') return value;
  const lower = value.toLowerCase();
  for (const root of roots) {
    const prefix = root.toLowerCase();
    if (lower === prefix) return '';
    if (lower.startsWith(`${prefix}/`)) return value.slice(root.length + 1);
  }
  return value;
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') {
    // SQLite has no NaN: it stores one as NULL, so emitting NULL round-trips.
    if (Number.isNaN(value)) return 'NULL';
    if (!Number.isFinite(value)) return value > 0 ? '9e999' : '-9e999';
    return String(value);
  }
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function columnsOf(db, table) {
  return db.prepare('SELECT name, pk FROM pragma_table_info(?) ORDER BY cid').all(table);
}

// Ordered by key, not insertion: SQLite reuses pages, so an unordered SELECT reshuffles rows.
function orderBy(db, table) {
  const pk = columnsOf(db, table)
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk));
  return pk.length > 0 ? pk.map((column) => ident(column.name)).join(', ') : 'rowid';
}

export function snapshotPath(dbPath) {
  return join(dirname(dbPath), 'snapshots', `${basename(dbPath).replace(/\.db$/, '')}.sql`);
}

export function exportSql(path, { strip = [] } = {}) {
  const roots = sortRoots(strip);
  // Read-write: a read-only handle cannot create the `-shm` a WAL database needs.
  const db = new DatabaseSync(path);
  try {
    const out = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];
    const { user_version: userVersion } = db.prepare('PRAGMA user_version').get();
    if (Number(userVersion) !== 0) out.push(`PRAGMA user_version=${Number(userVersion)};`);

    const objects = db
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
          WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
          ORDER BY rowid`,
      )
      .all();

    const rowCounts = new Map();
    let relativised = 0;
    const tables = objects.filter((object) => object.type === 'table');
    for (const table of tables) {
      out.push(`${table.sql};`);
      const names = columnsOf(db, table.name).map((column) => column.name);
      const list = names.map(ident).join(', ');
      const rows = db
        .prepare(`SELECT ${list} FROM ${ident(table.name)} ORDER BY ${orderBy(db, table.name)}`)
        .all();
      for (const row of rows) {
        const values = names.map((name) => {
          const value = relativise(row[name], roots);
          if (value !== row[name]) relativised += 1;
          return literal(value);
        });
        out.push(`INSERT INTO ${ident(table.name)} (${list}) VALUES (${values.join(', ')});`);
      }
      rowCounts.set(table.name, rows.length);
    }

    // Filtered out of the schema query above; dropping it restarts ids already handed out.
    const hasSequence = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`)
      .get();
    if (hasSequence) {
      const sequences = db.prepare('SELECT name, seq FROM sqlite_sequence ORDER BY name').all();
      if (sequences.length > 0) {
        out.push('DELETE FROM sqlite_sequence;');
        for (const row of sequences) {
          out.push(
            `INSERT INTO sqlite_sequence (name, seq) VALUES (${literal(row.name)}, ${literal(row.seq)});`,
          );
        }
      }
    }

    for (const object of objects.filter((object) => object.type !== 'table')) {
      out.push(`${object.sql};`);
    }
    out.push('COMMIT;');
    return { sql: `${out.join('\n')}\n`, rowCounts, relativised };
  } finally {
    db.close();
  }
}

export function snapshotRowCounts(sql) {
  const counts = new Map();
  for (const [, name] of sql.matchAll(/^INSERT INTO "((?:[^"]|"")+)" \(/gm)) {
    const table = name.replace(/""/g, '"');
    counts.set(table, (counts.get(table) ?? 0) + 1);
  }
  return counts;
}

// Tables the live database emptied while the snapshot still holds rows — the one lossy export.
export function emptiedTables(rowCounts, snapshotSql) {
  const snapshot = snapshotRowCounts(snapshotSql);
  return [...rowCounts]
    .filter(([table, count]) => count === 0 && (snapshot.get(table) ?? 0) > 0)
    .map(([table]) => table);
}

export function discardJournals(path) {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

export function restoreDb(path, snapshot) {
  // Built beside the target and moved in, so a failure leaves the old file whole, not half-written.
  const staging = `${path}.restoring`;
  try {
    rmSync(staging, { force: true });
    discardJournals(staging);
    const db = new DatabaseSync(staging);
    try {
      db.exec(readFileSync(snapshot, 'utf8'));
    } finally {
      db.close();
    }
    // Before the journals: a locked database throws here, with its own -wal still whole.
    rmSync(path, { force: true });
    // A journal left from the replaced database would replay into its successor.
    discardJournals(path);
    renameSync(staging, path);
  } catch (err) {
    rmSync(staging, { force: true });
    discardJournals(staging);
    throw err;
  }
}

export function hasUnexportedChanges(path, snapshot, { strip = [] } = {}) {
  if (!existsSync(snapshot)) return false;
  return exportSql(path, { strip }).sql !== readFileSync(snapshot, 'utf8');
}
