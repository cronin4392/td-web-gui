// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openEffectsDb } from './effects-db';
import { effectsApiHandler } from './effects-api-plugin';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';

let dir: string;
let root: string;
let db: DatabaseSync;

function call(method: string, url: string) {
  return callHandler(
    effectsApiHandler(() => db),
    method,
    url,
  );
}

function setFlag(flag: string, name: string, value: boolean) {
  return callHandlerWithBody(
    effectsApiHandler(() => db),
    'POST',
    `/${flag}`,
    JSON.stringify({ name, value }),
  );
}

function hide(name: string, hidden: boolean) {
  return setFlag('hidden', name, hidden);
}

function favorite(name: string, value: boolean) {
  return setFlag('favorite', name, value);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-effects-api-'));
  root = join(dir, 'Effects');
  mkdirSync(join(root, '3 Effect', 'Blur'), { recursive: true });
  writeFileSync(join(root, '3 Effect', 'Blur', 'Blur.tox'), '');
  vi.stubEnv('VJ_EFFECTS_ROOT', root);
  db = openEffectsDb(join(dir, 'effects.db'));
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('effectsApiHandler', () => {
  it('reconciles against the effect root on POST /sync and returns the effect catalog', () => {
    const res = call('POST', '/sync');

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([
      {
        name: 'Blur',
        hidden: false,
        favorite: false,
        path: `${root.replace(/\\/g, '/')}/3 Effect/Blur/Blur.tox`,
      },
    ]);
  });

  it('leaves the synced catalog readable on a following GET', () => {
    expect(JSON.parse(call('GET', '').body)).toEqual([]);
    call('POST', '/sync');

    expect(JSON.parse(call('GET', '').body)).toHaveLength(1);
  });

  it('reports a bad effect root as a 500 rather than throwing', () => {
    vi.stubEnv('VJ_EFFECTS_ROOT', join(dir, 'nope'));

    const res = call('POST', '/sync');
    expect(res.status).toBe(500);
    expect(res.body).toContain('nope');
  });

  it('hides an effect, and keeps it hidden across a sync', async () => {
    call('POST', '/sync');

    const hidden = await hide('Blur', true);
    expect(JSON.parse(hidden.body)).toEqual([
      expect.objectContaining({ name: 'Blur', hidden: true }),
    ]);

    expect(JSON.parse(call('POST', '/sync').body)).toEqual([
      expect.objectContaining({ hidden: true }),
    ]);
  });

  it('unhides again', async () => {
    call('POST', '/sync');
    await hide('Blur', true);

    expect(JSON.parse((await hide('Blur', false)).body)).toEqual([
      expect.objectContaining({ hidden: false }),
    ]);
  });

  it('favorites an effect, and keeps it favorited across a sync', async () => {
    call('POST', '/sync');

    const favorited = await favorite('Blur', true);
    expect(JSON.parse(favorited.body)).toEqual([
      expect.objectContaining({ name: 'Blur', favorite: true }),
    ]);

    expect(JSON.parse(call('POST', '/sync').body)).toEqual([
      expect.objectContaining({ favorite: true }),
    ]);
  });

  it('unfavorites again', async () => {
    call('POST', '/sync');
    await favorite('Blur', true);

    expect(JSON.parse((await favorite('Blur', false)).body)).toEqual([
      expect.objectContaining({ favorite: false }),
    ]);
  });

  it('reports a hide aimed at a vanished effect as a 500', async () => {
    call('POST', '/sync');

    const res = await hide('Ghost', true);

    expect(res.status).toBe(500);
    expect(res.body).toContain('Ghost');
  });
});
