import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, syncCatalog } from './scenes-api';
import type { Catalog, Scene } from '@domain/catalog/scene';

const SCENE: Scene = {
  name: 'AudioSpectrum',
  tags: ['audio'],
  rank: 200,
  dark: false,
  path: 'C:/Scenes/AudioSpectrum/AudioSpectrum.tox',
  thumbnail: '/scenes/AudioSpectrum/thumbnail.jpg',
};

const CATALOG: Catalog = { scenes: [SCENE], tags: ['audio'] };

const EMPTY: Catalog = { scenes: [], tags: [] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchCatalog', () => {
  it('returns the parsed catalog on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATALOG)));
    await expect(fetchCatalog()).resolves.toEqual(CATALOG);
  });

  it('falls back to an empty catalog on a non-ok response, warned once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchCatalog()).resolves.toEqual(EMPTY);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty catalog on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchCatalog()).resolves.toEqual(EMPTY);
  });

  it('falls back to an empty catalog on a response that fails shape validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ scenes: [{ name: 'no tags' }], tags: [] })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchCatalog()).resolves.toEqual(EMPTY);
  });

  it('falls back to an empty catalog on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchCatalog()).resolves.toEqual(EMPTY);
  });
});

describe('syncCatalog', () => {
  it('returns the rebuilt catalog from the sync response, in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATALOG));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncCatalog()).resolves.toEqual(CATALOG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/scenes/sync', { method: 'POST' });
  });

  it('rejects rather than falling back when the rebuilt catalog fails validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ scenes: [{}], tags: [] })));

    await expect(syncCatalog()).rejects.toThrow('shape validation');
  });

  it('rejects with the server message rather than falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ENOENT: no such scene root', { status: 500 })),
    );
    await expect(syncCatalog()).rejects.toThrow('ENOENT: no such scene root');
  });

  it('rejects on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(syncCatalog()).rejects.toThrow('network down');
  });
});
