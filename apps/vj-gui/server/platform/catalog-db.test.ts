// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogDbPath, requireRestoredDb } from './catalog-db';

let dir: string;
let previousCwd: string;

function cwd(withSnapshots: boolean): string {
  mkdirSync(join(dir, 'data', ...(withSnapshots ? ['snapshots'] : [])), { recursive: true });
  process.chdir(dir);
  return process.cwd();
}

beforeEach(() => {
  previousCwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'catalog-db-'));
});

afterEach(() => {
  process.chdir(previousCwd);
  delete process.env.VJ_TEST_DB;
  rmSync(dir, { recursive: true, force: true });
});

describe('catalogDbPath', () => {
  it('resolves data/<filename> under the cwd', () => {
    const root = cwd(true);
    expect(catalogDbPath('VJ_TEST_DB', 'scenes.db')).toBe(join(root, 'data', 'scenes.db'));
  });

  it('refuses a cwd whose data/ has no tracked snapshots', () => {
    cwd(false);
    expect(() => catalogDbPath('VJ_TEST_DB', 'scenes.db')).toThrow(/No snapshots directory/);
  });

  it('takes the env override without looking at the cwd', () => {
    cwd(false);
    const elsewhere = join(dir, 'elsewhere', 'scenes.db');
    process.env.VJ_TEST_DB = elsewhere;
    expect(catalogDbPath('VJ_TEST_DB', 'scenes.db')).toBe(elsewhere);
  });
});

describe('requireRestoredDb', () => {
  it('refuses an absent database whose snapshot is there', () => {
    const root = cwd(true);
    writeFileSync(join(root, 'data', 'snapshots', 'scenes.sql'), '', 'utf8');
    expect(() => requireRestoredDb(join(root, 'data', 'scenes.db'))).toThrow(/db:restore/);
  });

  it('passes a database that is there', () => {
    const root = cwd(true);
    writeFileSync(join(root, 'data', 'snapshots', 'scenes.sql'), '', 'utf8');
    const path = join(root, 'data', 'scenes.db');
    writeFileSync(path, '', 'utf8');
    expect(() => requireRestoredDb(path)).not.toThrow();
  });

  it('passes when there is no snapshot to restore from', () => {
    const root = cwd(true);
    expect(() => requireRestoredDb(join(root, 'data', 'scenes.db'))).not.toThrow();
  });
});
