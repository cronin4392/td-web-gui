import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { parseArgs, rootsFrom, show } from './lib/cli.mjs';
import { emptiedTables, exportSql, snapshotPath } from './lib/snapshot.mjs';

const USAGE = `usage: node scripts/db-export.mjs [options] <db>...

Writes each database out to data/snapshots/<name>.sql, the tracked text copy.

  --force          export even when a table the snapshot has rows for is empty
  --env <file>     load this .env before reading --strip variables (repeatable)
  --strip <VAR>    rewrite paths under this variable's value as relative to it
                   (repeatable), so no machine's content root reaches the snapshot
  --help           print this`;

function main(argv) {
  let args;
  try {
    args = parseArgs(argv, { flags: ['--force', '--help'], options: ['--env', '--strip'] });
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
    const target = snapshotPath(path);
    // An absent `.db` is not an empty one: opening it would create it and dump nothing.
    if (!existsSync(path)) {
      console.error(
        `✗ ${show(path)}: no database there — \`pnpm db:restore\` rebuilds one from its snapshot`,
      );
      failed = true;
      continue;
    }
    try {
      const { sql, rowCounts, relativised } = exportSql(path, { strip });
      const emptied = existsSync(target)
        ? emptiedTables(rowCounts, readFileSync(target, 'utf8'))
        : [];
      if (emptied.length > 0 && !args.has('--force')) {
        console.error(
          `✗ ${show(path)}: ${emptied.join(', ')} empty, but ${show(target)} has rows for ` +
            'them — `pnpm db:restore --force` restores the database, `--force` exports it anyway',
        );
        failed = true;
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, sql, 'utf8');
      const rows = [...rowCounts.values()].reduce((total, count) => total + count, 0);
      const relative = relativised > 0 ? `, ${relativised} paths relative` : '';
      console.log(
        `✓ ${show(path)} -> ${show(target)}  (${rowCounts.size} tables, ${rows} rows${relative})`,
      );
    } catch (err) {
      console.error(`✗ ${show(path)}: ${err.message}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
