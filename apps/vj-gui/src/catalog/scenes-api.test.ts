import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTag,
  deleteTag,
  fetchCatalog,
  renameTag,
  setSceneHidden,
  setSceneTag,
  setTagOrder,
  syncCatalog,
} from './scenes-api';
import type { Catalog, Scene } from '@domain/catalog/scene';

const SCENE: Scene = {
  name: 'AudioSpectrum',
  tags: ['audio'],
  rank: 200,
  dark: false,
  hidden: false,
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
  it('returns the synced catalog from the sync response, in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATALOG));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncCatalog()).resolves.toEqual(CATALOG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/scenes/sync', { method: 'POST' });
  });

  it('rejects rather than falling back when the synced catalog fails validation', async () => {
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

describe('setSceneHidden', () => {
  it('posts the name and flag and returns the catalog that resulted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(CATALOG));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setSceneHidden('AudioSpectrum', true)).resolves.toEqual(CATALOG);
    expect(fetchMock).toHaveBeenCalledWith('/api/scenes/hidden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AudioSpectrum', value: true }),
    });
  });

  it('rejects rather than falling back when the response fails validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ scenes: [{}], tags: [] })));
    await expect(setSceneHidden('AudioSpectrum', true)).rejects.toThrow('shape validation');
  });

  it('rejects with the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no such scene', { status: 400 })),
    );
    await expect(setSceneHidden('Gone', true)).rejects.toThrow('no such scene');
  });
});

describe('tag mutations', () => {
  function posted(): { url: string; body: unknown } {
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, body: JSON.parse(init.body as string) };
  }

  function stub(): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(CATALOG)));
  }

  it('posts a create to its own route', async () => {
    stub();
    await expect(createTag('neon')).resolves.toEqual(CATALOG);
    expect(posted()).toEqual({ url: '/api/scenes/tags/create', body: { name: 'neon' } });
  });

  it('posts a rename with both names', async () => {
    stub();
    await renameTag('neon', 'glow');
    expect(posted()).toEqual({
      url: '/api/scenes/tags/rename',
      body: { name: 'neon', to: 'glow' },
    });
  });

  it('posts a delete', async () => {
    stub();
    await deleteTag('neon');
    expect(posted()).toEqual({ url: '/api/scenes/tags/delete', body: { name: 'neon' } });
  });

  it('posts the whole list to reorder', async () => {
    stub();
    await setTagOrder(['b', 'a']);
    expect(posted()).toEqual({ url: '/api/scenes/tags/order', body: { names: ['b', 'a'] } });
  });

  it('posts a scene-tag membership like a flag', async () => {
    stub();
    await setSceneTag('AudioSpectrum', 'neon', true);
    expect(posted()).toEqual({
      url: '/api/scenes/tagged',
      body: { scene: 'AudioSpectrum', tag: 'neon', value: true },
    });
  });

  it('rejects with the server message rather than falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('tag "neon" already exists', { status: 500 })),
    );
    await expect(createTag('neon')).rejects.toThrow('tag "neon" already exists');
  });

  it('rejects when the response fails shape validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ scenes: [{}], tags: [] })));
    await expect(deleteTag('neon')).rejects.toThrow('shape validation');
  });
});
