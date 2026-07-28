// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openScenesDb } from './scenes-db';
import { scenesApiHandler } from './scenes-api-plugin';

let dir: string;
let root: string;
let db: DatabaseSync;

interface Result {
  status: number;
  body: string;
  nexted: boolean;
}

function call(method: string, url: string): Result {
  const result: Result = { status: 200, body: '', nexted: false };
  const res = {
    set statusCode(value: number) {
      result.status = value;
    },
    get statusCode() {
      return result.status;
    },
    setHeader: () => undefined,
    end: (body?: string) => {
      result.body = body ?? '';
    },
  } as unknown as ServerResponse;

  scenesApiHandler(() => db)({ method, url } as IncomingMessage, res, () => {
    result.nexted = true;
  });
  return result;
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
  it('serves the catalog on the bare route, with or without a query or trailing slash', () => {
    for (const url of ['', '/', '?t=1', '/?t=1']) {
      const res = call('GET', url);
      expect(res.status, url).toBe(200);
      expect(JSON.parse(res.body), url).toEqual({ scenes: [], tags: expect.any(Array) });
    }
  });

  it('rebuilds the catalog on POST /sync and returns it, trailing slash included', () => {
    const res = call('POST', '/sync/');

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).scenes).toEqual([
      expect.objectContaining({ name: 'AudioSpectrum', tags: ['audio'] }),
    ]);
  });

  it('leaves the synced catalog readable on a following GET', () => {
    call('POST', '/sync');

    expect(JSON.parse(call('GET', '').body).scenes).toHaveLength(1);
  });

  it('reports a bad scene root as a 500 rather than throwing', () => {
    vi.stubEnv('VJ_SCENES_ROOT', join(dir, 'nope'));

    const res = call('POST', '/sync');
    expect(res.status).toBe(500);
    expect(res.body).toContain('nope');
  });

  it('passes anything else to the next middleware', () => {
    expect(call('GET', '/sync').nexted).toBe(true);
    expect(call('POST', '').nexted).toBe(true);
    expect(call('DELETE', '').nexted).toBe(true);
    expect(call('GET', '/unknown').nexted).toBe(true);
  });
});
