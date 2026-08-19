// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openScenesDb } from './scenes-db';
import { scenesApiHandler } from './scenes-api-plugin';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';

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

function hide(name: string, hidden: boolean) {
  return callHandlerWithBody(
    scenesApiHandler(() => db),
    'POST',
    '/hidden',
    JSON.stringify({ name, hidden }),
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
  it('reconciles against the scene root on POST /sync and returns the scene catalog', () => {
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

  it('hides a scene, and keeps it hidden across a sync', async () => {
    call('POST', '/sync');

    const hidden = await hide('AudioSpectrum', true);
    expect(JSON.parse(hidden.body).scenes).toEqual([
      expect.objectContaining({ name: 'AudioSpectrum', hidden: true }),
    ]);

    const resynced = JSON.parse(call('POST', '/sync').body);
    expect(resynced.scenes).toEqual([expect.objectContaining({ hidden: true })]);
  });

  it('unhides again', async () => {
    call('POST', '/sync');
    await hide('AudioSpectrum', true);

    const shown = await hide('AudioSpectrum', false);
    expect(JSON.parse(shown.body).scenes).toEqual([expect.objectContaining({ hidden: false })]);
  });

  it('reports a hide aimed at a vanished scene as a 500', async () => {
    call('POST', '/sync');

    const res = await hide('Ghost', true);

    expect(res.status).toBe(500);
    expect(res.body).toContain('Ghost');
  });
});
