/**
 * Rebuilds a live `.db` from its `data/snapshots/*.sql` counterpart — the other
 * half of `db-export.mjs`, and the reason that export can be trusted as a backup.
 *
 * Refuses to clobber an existing database without `--force`, because the live
 * file is usually the newer one.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { relative, sep } from 'node:path';

import { snapshotPath } from './db-export.mjs';

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const paths = argv.filter((arg) => arg !== '--force');

if (paths.length === 0) {
  console.error('usage: node scripts/db-import.mjs [--force] <db>...');
  process.exit(2);
}

const show = (path) => relative(process.cwd(), path).split(sep).join('/');

function discardJournals(path) {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

let failed = false;
for (const path of paths) {
  const snapshot = snapshotPath(path);
  if (!existsSync(snapshot)) {
    console.error(`✗ ${show(path)}: no snapshot at ${show(snapshot)}`);
    failed = true;
    continue;
  }
  if (existsSync(path) && !force) {
    console.error(`✗ ${show(path)}: already exists — pass --force to replace it`);
    failed = true;
    continue;
  }

  // Built beside the target and moved into place, so a failure part-way through
  // leaves the existing database untouched rather than half-written.
  const staging = `${path}.importing`;
  try {
    rmSync(staging, { force: true });
    discardJournals(staging);
    const db = new DatabaseSync(staging);
    try {
      db.exec(readFileSync(snapshot, 'utf8'));
    } finally {
      db.close();
    }
    // A journal left from the replaced database would replay into the file that
    // took its place, silently undoing the import.
    discardJournals(path);
    rmSync(path, { force: true });
    renameSync(staging, path);
    console.log(`✓ ${show(snapshot)} -> ${show(path)}`);
  } catch (err) {
    rmSync(staging, { force: true });
    discardJournals(staging);
    const locked = err.code === 'EBUSY' || err.code === 'EPERM';
    console.error(
      `✗ ${show(path)}: ${err.message}` +
        (locked ? '\n  The file is open elsewhere — stop the dev server and any DB viewer.' : ''),
    );
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
