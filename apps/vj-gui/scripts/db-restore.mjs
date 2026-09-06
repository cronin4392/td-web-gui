import { existsSync } from 'node:fs';

import { parseArgs, rootsFrom, show } from './lib/cli.mjs';
import { hasUnexportedChanges, restoreDb, snapshotPath } from './lib/snapshot.mjs';

const USAGE = `usage: node scripts/db-restore.mjs [options] <db>...

Rebuilds each database from data/snapshots/<name>.sql, its tracked text copy.

  --force             replace a database that is already there
  --discard-changes   with --force, replace one holding unexported changes
  --if-missing        fill in absent databases only, quietly
  --env <file>        load this .env before reading --strip variables (repeatable)
  --strip <VAR>       the variables the snapshot was exported with (repeatable),
                      so the unexported-changes check compares like with like
  --help              print this`;

function main(argv) {
  let args;
  try {
    args = parseArgs(argv, {
      flags: ['--force', '--discard-changes', '--if-missing', '--help'],
      options: ['--env', '--strip'],
    });
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (args.has('--help')) {
    console.log(USAGE);
    return 0;
  }
  if (args.paths.length === 0) {
    console.error(USAGE);
    return 2;
  }

  const strip = rootsFrom(args.all('--env'), args.all('--strip'));
  let failed = false;
  for (const path of args.paths) {
    const snapshot = snapshotPath(path);
    if (!existsSync(snapshot)) {
      console.error(`✗ ${show(path)}: no snapshot at ${show(snapshot)}`);
      failed = true;
      continue;
    }
    // Quiet and successful, so `predev` can run on every start without narrating three skips.
    if (existsSync(path) && args.has('--if-missing')) continue;
    if (existsSync(path) && !args.has('--force')) {
      console.error(`✗ ${show(path)}: already exists — pass --force to replace it`);
      failed = true;
      continue;
    }

    try {
      // Export is manual, so this file may hold the only copy of an authored Tag, Rank or phrase.
      if (existsSync(path) && !args.has('--discard-changes')) {
        if (hasUnexportedChanges(path, snapshot, { strip })) {
          console.error(
            `✗ ${show(path)}: has changes not in ${show(snapshot)} — ` +
              '`pnpm db:export` keeps them, `--discard-changes` throws them away',
          );
          failed = true;
          continue;
        }
      }
      restoreDb(path, snapshot);
      console.log(`✓ ${show(snapshot)} -> ${show(path)}`);
    } catch (err) {
      const locked = err.code === 'EBUSY' || err.code === 'EPERM';
      console.error(
        `✗ ${show(path)}: ${err.message}` +
          (locked ? '\n  The file is open elsewhere — stop the dev server and any DB viewer.' : ''),
      );
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
