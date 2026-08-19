// @vitest-environment node
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { catalogApiHandler } from './api-plugin';
import { callHandler, callHandlerWithBody } from './api-plugin.test-helpers';

const DB = { tag: 'db' } as unknown as DatabaseSync;

function handler(overrides: Partial<Parameters<typeof catalogApiHandler>[0]> = {}) {
  const config = {
    read: vi.fn().mockReturnValue({ catalog: 'read' }),
    sync: vi.fn(),
    setHidden: vi.fn(),
    ...overrides,
  };
  const middleware = catalogApiHandler(config)(() => DB);
  return {
    ...config,
    call: (method: string, url: string) => callHandler(middleware, method, url),
    callWithBody: (method: string, url: string, body: string) =>
      callHandlerWithBody(middleware, method, url, body),
  };
}

describe('catalogApiHandler', () => {
  it('serves the catalog on the bare route, with or without a query or trailing slash', () => {
    const { call, read } = handler();

    for (const url of ['', '/', '?t=1', '/?t=1']) {
      const res = call('GET', url);
      expect(res.status, url).toBe(200);
      expect(JSON.parse(res.body), url).toEqual({ catalog: 'read' });
    }
    expect(read).toHaveBeenCalledWith(DB);
  });

  it('syncs before reading on POST /sync, trailing slash included', () => {
    const order: string[] = [];
    const { call, read, sync } = handler({
      read: vi.fn(() => {
        order.push('read');
        return { catalog: 'rebuilt' };
      }),
      sync: vi.fn(() => {
        order.push('sync');
      }),
    });

    const res = call('POST', '/sync/');

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ catalog: 'rebuilt' });
    expect(order).toEqual(['sync', 'read']);
    expect(sync).toHaveBeenCalledWith(DB);
    expect(read).toHaveBeenCalledWith(DB);
  });

  it('reports a throwing sync as a 500 carrying its message', () => {
    const { call } = handler({
      sync: vi.fn(() => {
        throw new Error('ENOENT: no such root');
      }),
    });

    const res = call('POST', '/sync');
    expect(res.status).toBe(500);
    expect(res.body).toContain('ENOENT: no such root');
  });

  it('reports a throwing read as a 500', () => {
    const { call } = handler({
      read: vi.fn(() => {
        throw new Error('database is locked');
      }),
    });

    const res = call('GET', '');
    expect(res.status).toBe(500);
    expect(res.body).toContain('database is locked');
  });

  it('hides before reading on POST /hidden, and answers with the catalog that resulted', async () => {
    const order: string[] = [];
    const { callWithBody, read, setHidden } = handler({
      read: vi.fn(() => {
        order.push('read');
        return { catalog: 'after' };
      }),
      setHidden: vi.fn(() => {
        order.push('setHidden');
      }),
    });

    const res = await callWithBody(
      'POST',
      '/hidden',
      JSON.stringify({ name: 'One', hidden: true }),
    );

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ catalog: 'after' });
    expect(order).toEqual(['setHidden', 'read']);
    expect(setHidden).toHaveBeenCalledWith(DB, 'One', true);
    expect(read).toHaveBeenCalledWith(DB);
  });

  it('carries a false flag through as an unhide', async () => {
    const { callWithBody, setHidden } = handler();

    await callWithBody('POST', '/hidden', JSON.stringify({ name: 'One', hidden: false }));

    expect(setHidden).toHaveBeenCalledWith(DB, 'One', false);
  });

  it('rejects a malformed or ill-shaped body as a 400, without touching the database', async () => {
    for (const body of [
      '{not json',
      '{}',
      JSON.stringify({ name: 'One' }),
      JSON.stringify({ name: '', hidden: true }),
      JSON.stringify({ name: 'One', hidden: 'yes' }),
      JSON.stringify(['One', true]),
    ]) {
      const { callWithBody, setHidden } = handler();

      const res = await callWithBody('POST', '/hidden', body);

      expect(res.status, body).toBe(400);
      expect(setHidden, body).not.toHaveBeenCalled();
    }
  });

  it('reports a throwing setHidden as a 500 carrying its message', async () => {
    const { callWithBody } = handler({
      setHidden: vi.fn(() => {
        throw new Error('database is locked');
      }),
    });

    const res = await callWithBody(
      'POST',
      '/hidden',
      JSON.stringify({ name: 'One', hidden: true }),
    );

    expect(res.status).toBe(500);
    expect(res.body).toContain('database is locked');
  });

  it('passes anything else to the next middleware, touching neither read nor sync', () => {
    const { call, read, sync, setHidden } = handler();

    for (const [method, url] of [
      ['GET', '/sync'],
      ['GET', '/hidden'],
      ['POST', ''],
      ['DELETE', ''],
      ['GET', '/unknown'],
    ] as const) {
      expect(call(method, url).nexted, `${method} ${url}`).toBe(true);
    }
    expect(read).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(setHidden).not.toHaveBeenCalled();
  });
});
