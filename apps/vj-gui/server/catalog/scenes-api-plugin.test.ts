// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openScenesDb } from './scenes-db';
import { scenesApiHandler } from './scenes-api-plugin';
import { callHandler } from '../platform/api-plugin.test-helpers';

let dir: string;
let root: string;
let db: DatabaseSync;

function call(method: string, url: string) {
  return callHandler(
    scenesApiHandler(() => db),
    method,
    url,
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-scenes-api-'));
  root = join(dir, 'Scenes');
  mkdirSync(join(root, 'AudioSpectrum'), { recursive: true });
  writeFileSync(join(root, 'AudioSpectrum', 'meta.json'), JSON.stringify({ tags: ['audio'] }));
  writeFileSync(join(root, 'AudioSpectrum', 'AudioSpectrum.tox'), '');
  vi.stubEnv('VJ_SCENES_ROOT', root);
  db = openScenesDb(join(dir, 'scenes.db'));
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('scenesApiHandler', () => {
  it('rebuilds from the scene root on POST /sync and returns the scene catalog', () => {
    const res = call('POST', '/sync');

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).scenes).toEqual([
      expect.objectContaining({ name: 'AudioSpectrum', tags: ['audio'] }),
    ]);
  });

  it('leaves the synced catalog readable on a following GET', () => {
    expect(JSON.parse(call('GET', '').body).scenes).toEqual([]);
    call('POST', '/sync');

    expect(JSON.parse(call('GET', '').body).scenes).toHaveLength(1);
  });

  it('reports a bad scene root as a 500 rather than throwing', () => {
    vi.stubEnv('VJ_SCENES_ROOT', join(dir, 'nope'));

    const res = call('POST', '/sync');
    expect(res.status).toBe(500);
    expect(res.body).toContain('nope');
  });
});
