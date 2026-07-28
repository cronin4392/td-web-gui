/**
 * `wordbank-api.ts` tests. `fetchWordbank()`'s fallback-on-failure behavior is
 * what used to be `store.ts`'s corrupt-JSON / unknown-version handling
 * (TEXT_SELECTOR.md §5) — moved here because the failure now comes from the
 * `/api/wordbank` response, not a raw `localStorage` read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultWordbank, type Wordbank } from '@domain/wordbank/wordbank';
import { fetchWordbank, saveWordbank } from './wordbank-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchWordbank', () => {
  it('returns the parsed wordbank on success', async () => {
    const wordbank: Wordbank = {
      lists: [{ id: 'a', name: 'Cues', phrases: ['hi'] }],
      recent: ['hi'],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(wordbank), { status: 200 })),
    );
    await expect(fetchWordbank()).resolves.toEqual(wordbank);
  });

  it('falls back to a default wordbank on a non-ok response, warned once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wordbank = await fetchWordbank();
    expect(wordbank.lists).toHaveLength(1);
    expect(wordbank.lists[0]?.name).toBe('List 1');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default wordbank on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not json', { status: 200 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wordbank = await fetchWordbank();
    expect(wordbank.lists[0]?.name).toBe('List 1');
  });

  it('falls back to a default wordbank on a response that fails shape validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wordbank = await fetchWordbank();
    expect(wordbank.lists[0]?.name).toBe('List 1');
  });

  it('falls back to a default wordbank on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wordbank = await fetchWordbank();
    expect(wordbank.lists[0]?.name).toBe('List 1');
  });
});

describe('saveWordbank', () => {
  it('resolves on a successful PUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(saveWordbank(defaultWordbank())).resolves.toBeUndefined();
  });

  it('rejects on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(saveWordbank(defaultWordbank())).rejects.toThrow();
  });
});
