// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openEffectsDb } from './effects-db';
import { effectsApiHandler } from './effects-api-plugin';
import { callHandler } from '../platform/api-plugin.test-helpers';

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
  it('rebuilds from the effect root on POST /sync and returns the effect catalog', () => {
    const res = call('POST', '/sync');

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([
      { name: 'Blur', path: `${root.replace(/\\/g, '/')}/3 Effect/Blur/Blur.tox` },
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
});
