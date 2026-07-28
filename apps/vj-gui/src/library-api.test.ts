/**
 * `library-api.ts` tests. `fetchLibrary()`'s fallback-on-failure behavior is
 * what used to be `store.ts`'s corrupt-JSON / unknown-version handling
 * (TEXT_SELECTOR.md §5) — moved here because the failure now comes from the
 * `/api/library` response, not a raw `localStorage` read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLibrary, type Library } from '@domain/wordbank/wordbank';
import { fetchLibrary, saveLibrary } from './library-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchLibrary', () => {
  it('returns the parsed library on success', async () => {
    const library: Library = { tabs: [{ id: 'a', name: 'Cues', phrases: ['hi'] }], recent: ['hi'] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(library), { status: 200 })),
    );
    await expect(fetchLibrary()).resolves.toEqual(library);
  });

  it('falls back to a default library on a non-ok response, warned once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = await fetchLibrary();
    expect(library.tabs).toHaveLength(1);
    expect(library.tabs[0]?.name).toBe('List 1');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default library on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = await fetchLibrary();
    expect(library.tabs[0]?.name).toBe('List 1');
  });

  it('falls back to a default library on a response that fails shape validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = await fetchLibrary();
    expect(library.tabs[0]?.name).toBe('List 1');
  });

  it('falls back to a default library on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = await fetchLibrary();
    expect(library.tabs[0]?.name).toBe('List 1');
  });
});

describe('saveLibrary', () => {
  it('resolves on a successful PUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(saveLibrary(defaultLibrary())).resolves.toBeUndefined();
  });

  it('rejects on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(saveLibrary(defaultLibrary())).rejects.toThrow();
  });
});
