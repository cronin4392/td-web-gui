// A `.db` read under an un-checkpointed WAL opens cleanly and passes an integrity
// check while missing recent writes, so this exits non-zero rather than stay quiet.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';

import { show } from './lib/cli.mjs';

// SQLite answers a checkpoint on a non-WAL database with -1s: a pass, no log to fold in.
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
  const name = show(path);
  // `.db` files are untracked, so a fresh clone has none. Opening one would create an
  // empty database that `db:restore --if-missing` then skips, losing the snapshot's rows.
  if (!existsSync(path)) {
    console.log(`- ${name}: no database there — nothing to checkpoint`);
    continue;
  }

  // Measured up front: a successful TRUNCATE zeroes the counters its own result reports.
  const before = walBytes(path);
  let result;
  try {
    result = checkpoint(path);
  } catch (err) {
    console.error(`✗ ${name}: could not open — ${err.message}`);
    failed = true;
    continue;
  }

  // `busy` means a reader blocked the checkpoint, so frames are stranded in the log.
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
