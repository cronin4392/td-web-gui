import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function ident(name) {
  return `"${name.replace(/"/g, '""')}"`;
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

/** Row order has to come from the key, not insertion order: SQLite is free to
 * reuse pages, so an unordered SELECT can reshuffle rows that never changed. */
function orderBy(db, table) {
  const pk = columnsOf(db, table)
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk));
  return pk.length > 0 ? pk.map((column) => ident(column.name)).join(', ') : 'rowid';
}

function exportDb(path) {
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

    let rowCount = 0;
    const tables = objects.filter((object) => object.type === 'table');
    for (const table of tables) {
      out.push(`${table.sql};`);
      const names = columnsOf(db, table.name).map((column) => column.name);
      const list = names.map(ident).join(', ');
      const rows = db
        .prepare(`SELECT ${list} FROM ${ident(table.name)} ORDER BY ${orderBy(db, table.name)}`)
        .all();
      for (const row of rows) {
        const values = names.map((name) => literal(row[name])).join(', ');
        out.push(`INSERT INTO ${ident(table.name)} (${list}) VALUES (${values});`);
      }
      rowCount += rows.length;
    }

    // AUTOINCREMENT counters live in a table the schema query above filters out;
    // dropping them silently restarts ids at a value already handed out.
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
    return { sql: `${out.join('\n')}\n`, tables: tables.length, rows: rowCount };
  } finally {
    db.close();
  }
}

export function snapshotPath(dbPath) {
  return join(dirname(dbPath), 'snapshots', `${basename(dbPath).replace(/\.db$/, '')}.sql`);
}

const show = (path) => relative(process.cwd(), path).split(sep).join('/');

function main(paths) {
  if (paths.length === 0) {
    console.error('usage: node scripts/db-export.mjs <db>...');
    process.exit(2);
  }
  let failed = false;
  for (const path of paths) {
    const target = snapshotPath(path);
    // An absent `.db` is not an empty one: opening it would create it, and the
    // empty dump would then overwrite a good snapshot with nothing.
    if (!existsSync(path)) {
      console.error(
        `✗ ${show(path)}: no database there — \`pnpm db:import\` rebuilds one from its snapshot`,
      );
      failed = true;
      continue;
    }
    try {
      const { sql, tables, rows } = exportDb(path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, sql, 'utf8');
      console.log(`✓ ${show(path)} -> ${show(target)}  (${tables} tables, ${rows} rows)`);
    } catch (err) {
      console.error(`✗ ${show(path)}: ${err.message}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

// Without this the CLI would run on `db-import.mjs`'s import and exit its process.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
