// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogDbPath } from './catalog-db';

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
