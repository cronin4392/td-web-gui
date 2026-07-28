// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { thumbnailsHandler } from './thumbnails-plugin';
import { callHandler, callStreamingHandler } from './api-plugin.test-helpers';

let dir: string;
let root: string;

function call(method: string, url: string) {
  return callStreamingHandler(thumbnailsHandler, method, url);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-thumbnails-'));
  root = join(dir, 'Scenes');
  mkdirSync(join(root, 'AudioSpectrum'), { recursive: true });
  writeFileSync(join(root, 'AudioSpectrum', 'thumb.png'), Buffer.from([1, 2, 3, 4]));
  vi.stubEnv('VJ_SCENES_ROOT', root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('thumbnailsHandler', () => {
  it('serves a file inside the scene root with the right headers', async () => {
    const res = await call('GET', '/AudioSpectrum/thumb.png');

    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Content-Length']).toBe('4');
    expect(res.headers['Cache-Control']).toBe('no-cache');
    expect(Buffer.from(res.body, 'utf8')).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('responds to HEAD with headers and no body', async () => {
    const res = await call('HEAD', '/AudioSpectrum/thumb.png');

    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.body).toBe('');
  });

  it('rejects a plain ../ traversal outside the scene root', async () => {
    const res = await call('GET', '/../secret.txt');
    expect(res.status).toBe(403);
  });

  it('rejects a deeper ../.. traversal outside the scene root', async () => {
    const res = await call('GET', '/AudioSpectrum/../../secret.txt');
    expect(res.status).toBe(403);
  });

  it('rejects a percent-encoded traversal', async () => {
    const res = await call('GET', '/%2e%2e/secret.txt');
    expect(res.status).toBe(403);
  });

  it('rejects an empty path', async () => {
    const res = await call('GET', '');
    expect(res.status).toBe(403);
  });

  it('rejects a Windows-drive-style absolute path folded into the root', async () => {
    const res = await call('GET', '/C:/Windows/win.ini');
    expect(res.status).toBe(404);
  });

  it('404s a missing file', async () => {
    const res = await call('GET', '/AudioSpectrum/missing.png');
    expect(res.status).toBe(404);
  });

  it('404s a directory rather than a file', async () => {
    const res = await call('GET', '/AudioSpectrum');
    expect(res.status).toBe(404);
  });

  it('passes non-GET/HEAD methods to the next middleware', async () => {
    const res = await call('POST', '/AudioSpectrum/thumb.png');
    expect(res.nexted).toBe(true);
  });

  it('reports a missing VJ_SCENES_ROOT as a 500 rather than throwing', async () => {
    vi.unstubAllEnvs();
    const res = await call('GET', '/AudioSpectrum/thumb.png');
    expect(res.status).toBe(500);
  });
});
