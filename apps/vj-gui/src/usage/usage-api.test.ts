import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLive, fetchScores, postReport, setLive } from './usage-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchLive', () => {
  it('returns the server’s status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ on: true, paused: true })));
    await expect(fetchLive()).resolves.toEqual({ on: true, paused: true });
  });

  it('falls back to off when the server cannot say', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchLive()).resolves.toEqual({ on: false, paused: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('setLive', () => {
  it('posts the wanted state and returns the resulting status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ on: true, paused: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setLive(true)).resolves.toEqual({ on: true, paused: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usage/live',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ on: true }) }),
    );
  });

  it('rejects with the server’s own message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no database', { status: 500 })));
    await expect(setLive(true)).rejects.toThrow('no database');
  });
});

describe('postReport', () => {
  it('rejects a response that is not a status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    await expect(postReport({ layers: [], activeColorScheme: '' })).rejects.toThrow(
      'shape validation',
    );
  });
});

describe('fetchScores', () => {
  it('asks for one kind', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ X: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchScores('scene')).resolves.toEqual({ X: 2 });
    expect(fetchMock).toHaveBeenCalledWith('/api/usage/scores?kind=scene');
  });

  it('falls back to no scores on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchScores('scheme')).resolves.toEqual({});
  });
});
