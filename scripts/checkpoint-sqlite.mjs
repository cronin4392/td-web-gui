/**
 * Folds each named SQLite database's write-ahead log back into the `.db` file,
 * so the file on its own is a complete, committable snapshot.
 *
 * These catalogs run in WAL mode, where a committed transaction lives in the
 * `-wal` until a checkpoint moves it. A `.db` copied out from under an
 * un-checkpointed WAL still opens cleanly and still passes an integrity check —
 * it is simply missing the most recent writes, with nothing to say so. That
 * silence is the reason this is enforced rather than documented. Committing the
 * `-wal` instead is not an option: it is machine-local, and a `.db`/`-wal` pair
 * captured at two different instants is a corrupt combination.
 *
 * Safe to run against a live dev server. WAL writers only ever append to the
 * `-wal`; the `.db` itself is touched during a checkpoint and at no other time,
 * so once this returns, the file is stable even as the server keeps writing.
 *
 * Exits non-zero rather than letting a torn snapshot through — see `pnpm
 * db:checkpoint` and the `lint-staged` entry that calls this on commit.
 */

import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { relative } from 'node:path';

/** SQLite answers a checkpoint on a non-WAL database with -1s, which is a pass:
 * there was no log to fold in. */
function checkpoint(path) {
  const db = new DatabaseSync(path);
  try {
    return db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  } finally {
    db.close();
  }
}

function walBytes(path) {
  try {
    return statSync(`${path}-wal`).size;
  } catch {
    return 0;
  }
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: node scripts/checkpoint-sqlite.mjs <db>...');
  process.exit(2);
}

let failed = false;
for (const path of paths) {
  const name = relative(process.cwd(), path).replace(/\\/g, '/');
  // Measured up front: a successful TRUNCATE resets the pragma's own counters
  // to zero, so its result cannot tell you whether it just moved 150KB or found
  // nothing to do.
  const before = walBytes(path);
  let result;
  try {
    result = checkpoint(path);
  } catch (err) {
    console.error(`✗ ${name}: could not open — ${err.message}`);
    failed = true;
    continue;
  }

  // `busy` is the blocker worth naming: another connection held a read the
  // checkpoint could not get past, so frames are still stranded in the log.
  const remaining = walBytes(path);
  if (result.busy !== 0 || remaining > 0) {
    console.error(
      `✗ ${name}: WAL not fully checkpointed ` +
        `(busy=${result.busy}, ${remaining} bytes left in -wal).\n` +
        `  A connection is parked in a read transaction. Stop the dev server and retry —\n` +
        `  committing now would capture a .db that looks valid but is missing recent writes.`,
    );
    failed = true;
    continue;
  }

  console.log(
    `✓ ${name}: ${before > 0 ? `${(before / 1024).toFixed(0)}KB folded in` : 'already clean'}`,
  );
}

process.exit(failed ? 1 : 0);
