import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(here, 'db-export.mjs');
const RESTORE = join(here, 'db-restore.mjs');

let dir;

const db = () => join(dir, 'data', 'scenes.db');
const snapshot = () => join(dir, 'data', 'snapshots', 'scenes.sql');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: dir });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function seed(rows) {
  mkdirSync(join(dir, 'data'), { recursive: true });
  const handle = new DatabaseSync(db());
  try {
    handle.exec('CREATE TABLE scenes (name TEXT PRIMARY KEY NOT NULL, hidden INTEGER NOT NULL)');
    for (const name of rows) handle.prepare('INSERT INTO scenes VALUES (?, 0)').run(name);
  } finally {
    handle.close();
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'db-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('db-export', () => {
  it('prints usage and exits 0 for --help', () => {
    const { code, out } = run(EXPORT, ['--help']);
    expect(code).toBe(0);
    expect(out).toContain('usage: node scripts/db-export.mjs');
  });

  it('exits 2 with usage when given no database', () => {
    expect(run(EXPORT, []).code).toBe(2);
  });

  it('exits 2 on an unknown option rather than reading it as a path', () => {
    const { code, err } = run(EXPORT, ['--nope', 'data/scenes.db']);
    expect(code).toBe(2);
    expect(err).toContain('unknown option --nope');
  });

  it('writes the snapshot beside the database', () => {
    seed(['Alpha', 'Mike']);
    const { code, out } = run(EXPORT, ['data/scenes.db']);
    expect(code).toBe(0);
    expect(out).toContain('data/scenes.db -> data/snapshots/scenes.sql');
    expect(readFileSync(snapshot(), 'utf8')).toContain(`VALUES ('Alpha', 0);`);
  });

  it('refuses a database that is not there rather than creating one', () => {
    const { code, err } = run(EXPORT, ['data/scenes.db']);
    expect(code).toBe(1);
    expect(err).toContain('no database there');
    expect(existsSync(db())).toBe(false);
  });

  it('refuses when a table went empty while its snapshot still has rows', () => {
    seed(['Alpha']);
    run(EXPORT, ['data/scenes.db']);
    const handle = new DatabaseSync(db());
    handle.exec('DELETE FROM scenes');
    handle.close();

    const { code, err } = run(EXPORT, ['data/scenes.db']);
    expect(code).toBe(1);
    expect(err).toContain('scenes empty');
    expect(readFileSync(snapshot(), 'utf8')).toContain(`'Alpha'`);
  });

  it('exports the emptied table anyway under --force', () => {
    seed(['Alpha']);
    run(EXPORT, ['data/scenes.db']);
    const handle = new DatabaseSync(db());
    handle.exec('DELETE FROM scenes');
    handle.close();

    expect(run(EXPORT, ['--force', 'data/scenes.db']).code).toBe(0);
    expect(readFileSync(snapshot(), 'utf8')).not.toContain(`'Alpha'`);
  });

  it('strips a root named by --strip out of an env file', () => {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, '.env'), 'VJ_TEST_ROOT=C:/Content\n', 'utf8');
    const handle = new DatabaseSync(db());
    handle.exec('CREATE TABLE scenes (name TEXT PRIMARY KEY NOT NULL, folder TEXT NOT NULL)');
    handle.exec(`INSERT INTO scenes VALUES ('Blur', 'C:/Content/3 Effect/Blur')`);
    handle.close();

    const { code, out } = run(EXPORT, [
      '--env',
      '.env',
      '--strip',
      'VJ_TEST_ROOT',
      'data/scenes.db',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('1 paths relative');
    expect(readFileSync(snapshot(), 'utf8')).toContain(`'3 Effect/Blur'`);
  });
});

describe('db-restore', () => {
  function snapshotOf(rows) {
    seed(rows);
    run(EXPORT, ['data/scenes.db']);
    rmSync(db(), { force: true });
  }

  it('prints usage and exits 0 for --help', () => {
    const { code, out } = run(RESTORE, ['--help']);
    expect(code).toBe(0);
    expect(out).toContain('usage: node scripts/db-restore.mjs');
  });

  it('rebuilds a missing database from its snapshot', () => {
    snapshotOf(['Alpha']);
    const { code, out } = run(RESTORE, ['data/scenes.db']);
    expect(code).toBe(0);
    expect(out).toContain('data/snapshots/scenes.sql -> data/scenes.db');
    expect(existsSync(db())).toBe(true);
  });

  it('refuses when there is no snapshot', () => {
    mkdirSync(join(dir, 'data'), { recursive: true });
    const { code, err } = run(RESTORE, ['data/scenes.db']);
    expect(code).toBe(1);
    expect(err).toContain('no snapshot at');
  });

  it('refuses an existing database without --force', () => {
    snapshotOf(['Alpha']);
    run(RESTORE, ['data/scenes.db']);
    const { code, err } = run(RESTORE, ['data/scenes.db']);
    expect(code).toBe(1);
    expect(err).toContain('already exists');
  });

  it('skips an existing database quietly under --if-missing', () => {
    snapshotOf(['Alpha']);
    run(RESTORE, ['data/scenes.db']);
    const { code, out } = run(RESTORE, ['--if-missing', 'data/scenes.db']);
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  it('fills in an absent database under --if-missing', () => {
    snapshotOf(['Alpha']);
    expect(run(RESTORE, ['--if-missing', 'data/scenes.db']).code).toBe(0);
    expect(existsSync(db())).toBe(true);
  });

  it('refuses --force when the database holds unexported changes', () => {
    snapshotOf(['Alpha']);
    run(RESTORE, ['data/scenes.db']);
    const handle = new DatabaseSync(db());
    handle.exec(`UPDATE scenes SET hidden = 1 WHERE name = 'Alpha'`);
    handle.close();

    const { code, err } = run(RESTORE, ['--force', 'data/scenes.db']);
    expect(code).toBe(1);
    expect(err).toContain('has changes not in');

    const handle2 = new DatabaseSync(db());
    const row = handle2.prepare(`SELECT hidden FROM scenes WHERE name = 'Alpha'`).get();
    handle2.close();
    expect(Number(row.hidden)).toBe(1);
  });

  it('replaces it anyway under --discard-changes', () => {
    snapshotOf(['Alpha']);
    run(RESTORE, ['data/scenes.db']);
    const handle = new DatabaseSync(db());
    handle.exec(`UPDATE scenes SET hidden = 1 WHERE name = 'Alpha'`);
    handle.close();

    expect(run(RESTORE, ['--force', '--discard-changes', 'data/scenes.db']).code).toBe(0);
    const handle2 = new DatabaseSync(db());
    const row = handle2.prepare(`SELECT hidden FROM scenes WHERE name = 'Alpha'`).get();
    handle2.close();
    expect(Number(row.hidden)).toBe(0);
  });

  it('leaves no staging file behind', () => {
    snapshotOf(['Alpha']);
    run(RESTORE, ['data/scenes.db']);
    expect(existsSync(`${db()}.restoring`)).toBe(false);
  });
});
