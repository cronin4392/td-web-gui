import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEffectCatalog, setEffectHidden, syncEffectCatalog } from './effects-api';
import type { EffectCatalog } from '@domain/catalog/effect';

const CATALOG: EffectCatalog = [
  { name: 'Blur', hidden: false, path: 'C:/Effects/3 Effect/Blur/Blur.tox' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchEffectCatalog', () => {
  it('returns the parsed catalog on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATALOG)));
    await expect(fetchEffectCatalog()).resolves.toEqual(CATALOG);
  });

  it('falls back to an empty catalog on a non-ok response, warned once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchEffectCatalog()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty catalog on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchEffectCatalog()).resolves.toEqual([]);
  });

  it('falls back to an empty catalog on a response that fails shape validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ name: 'no path' }])));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchEffectCatalog()).resolves.toEqual([]);
  });

  it('falls back to an empty catalog when handed a scene catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ scenes: [], tags: [] })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchEffectCatalog()).resolves.toEqual([]);
  });

  it('falls back to an empty catalog on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchEffectCatalog()).resolves.toEqual([]);
  });
});

describe('syncEffectCatalog', () => {
  it('returns the synced catalog from the sync response, in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATALOG));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncEffectCatalog()).resolves.toEqual(CATALOG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/effects/sync', { method: 'POST' });
  });

  it('rejects rather than falling back when the synced catalog fails validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{}])));

    await expect(syncEffectCatalog()).rejects.toThrow('shape validation');
  });

  it('rejects with the server message rather than falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ENOENT: no such effect root', { status: 500 })),
    );
    await expect(syncEffectCatalog()).rejects.toThrow('ENOENT: no such effect root');
  });

  it('rejects on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(syncEffectCatalog()).rejects.toThrow('network down');
  });
});

describe('setEffectHidden', () => {
  it('posts the name and flag and returns the catalog that resulted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATALOG));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setEffectHidden('Blur', true)).resolves.toEqual(CATALOG);
    expect(fetchMock).toHaveBeenCalledWith('/api/effects/hidden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blur', hidden: true }),
    });
  });

  it('rejects rather than falling back when the response fails validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ name: 'Blur' }])));
    await expect(setEffectHidden('Blur', true)).rejects.toThrow('shape validation');
  });

  it('rejects with the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no such effect', { status: 400 })),
    );
    await expect(setEffectHidden('Gone', true)).rejects.toThrow('no such effect');
  });
});
