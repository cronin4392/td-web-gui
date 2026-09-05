/**
 * A `.db` copied out from under an un-checkpointed WAL still opens cleanly and
 * still passes an integrity check — it is simply missing the most recent writes,
 * with nothing to say so. Exits non-zero rather than let that silence through.
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
