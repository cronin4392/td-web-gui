// @vitest-environment node
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogDbPath } from './catalog-db';

function cwd(withSnapshots: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-db-'));
  mkdirSync(join(dir, 'data', ...(withSnapshots ? ['snapshots'] : [])), { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.VJ_TEST_DB;
});

describe('catalogDbPath', () => {
  it('resolves data/<filename> under the cwd', () => {
    const dir = cwd(true);
    expect(catalogDbPath('VJ_TEST_DB', 'scenes.db')).toBe(join(dir, 'data', 'scenes.db'));
  });

  it('refuses a cwd whose data/ has no tracked snapshots', () => {
    cwd(false);
    expect(() => catalogDbPath('VJ_TEST_DB', 'scenes.db')).toThrow(/No snapshots directory/);
  });

  it('takes the env override without looking at the cwd', () => {
    cwd(false);
    process.env.VJ_TEST_DB = 'elsewhere/scenes.db';
    expect(catalogDbPath('VJ_TEST_DB', 'scenes.db')).toBe(resolve('elsewhere/scenes.db'));
  });
});
