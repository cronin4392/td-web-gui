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

function post(url: string, body: unknown) {
  return callHandlerWithBody(
    scenesApiHandler(() => db),
    'POST',
    url,
    typeof body === 'string' ? body : JSON.stringify(body),
  );
}

function hide(name: string, hidden: boolean) {
  return post('/hidden', { name, value: hidden });
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
    // `meta.json` lists `audio`; a Scan reports no tags at all.
    expect(JSON.parse(res.body).scenes).toEqual([
      expect.objectContaining({ name: 'AudioSpectrum', tags: [] }),
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

describe('scenesApiHandler tag routes', () => {
  const tagsOf = (res: { body: string }) => JSON.parse(res.body).tags as string[];
  const sceneTags = (res: { body: string }) => JSON.parse(res.body).scenes[0].tags as string[];

  beforeEach(async () => {
    call('POST', '/sync');
    for (const name of tagsOf(call('GET', ''))) await post('/tags/delete', { name });
  });

  it('creates, renames, reorders and deletes, answering with the catalog each time', async () => {
    expect(tagsOf(await post('/tags/create', { name: 'neon' }))).toEqual(['neon']);
    expect(tagsOf(await post('/tags/create', { name: 'text' }))).toEqual(['neon', 'text']);

    expect(tagsOf(await post('/tags/rename', { name: 'neon', to: 'glow' }))).toEqual([
      'glow',
      'text',
    ]);
    expect(tagsOf(await post('/tags/order', { names: ['text', 'glow'] }))).toEqual([
      'text',
      'glow',
    ]);
    expect(tagsOf(await post('/tags/delete', { name: 'text' }))).toEqual(['glow']);
  });

  it('tags and untags a scene, and keeps it across a sync', async () => {
    await post('/tags/create', { name: 'neon' });

    const tagged = await post('/tagged', { scene: 'AudioSpectrum', tag: 'neon', value: true });
    expect(sceneTags(tagged)).toEqual(['neon']);

    expect(sceneTags(call('POST', '/sync'))).toEqual(['neon']);

    const untagged = await post('/tagged', { scene: 'AudioSpectrum', tag: 'neon', value: false });
    expect(sceneTags(untagged)).toEqual([]);
  });

  it('keeps the scene when its tag is deleted', async () => {
    await post('/tags/create', { name: 'doomed' });
    await post('/tagged', { scene: 'AudioSpectrum', tag: 'doomed', value: true });

    const res = await post('/tags/delete', { name: 'doomed' });

    expect(tagsOf(res)).toEqual([]);
    expect(JSON.parse(res.body).scenes).toEqual([
      expect.objectContaining({ name: 'AudioSpectrum', tags: [] }),
    ]);
  });

  it('rejects a malformed body with a 400', async () => {
    expect((await post('/tags/create', '{ not json')).status).toBe(400);
    expect((await post('/tags/create', {})).status).toBe(400);
    expect((await post('/tags/create', { name: 7 })).status).toBe(400);
    expect((await post('/tags/rename', { name: 'a' })).status).toBe(400);
    expect((await post('/tags/order', { names: 'a' })).status).toBe(400);
    expect((await post('/tagged', { scene: 'A', tag: 'b' })).status).toBe(400);
  });

  it('separates a bad body from a catalog that disagrees', async () => {
    // Well-formed, but the name is blank once trimmed and the catalog refuses it.
    const blank = await post('/tags/create', { name: '   ' });
    expect(blank.status).toBe(500);
    expect(blank.body).toContain('needs a name');

    const ghost = await post('/tags/delete', { name: 'ghost' });
    expect(ghost.status).toBe(500);
    expect(ghost.body).toContain('ghost');
  });
});
