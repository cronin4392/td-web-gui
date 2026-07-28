// @vitest-environment node
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { catalogApiHandler } from './api-plugin';
import { callHandler } from './api-plugin.test-helpers';

const DB = { tag: 'db' } as unknown as DatabaseSync;

function handler(overrides: Partial<Parameters<typeof catalogApiHandler>[0]> = {}) {
  const config = {
    read: vi.fn().mockReturnValue({ catalog: 'read' }),
    sync: vi.fn(),
    ...overrides,
  };
  const middleware = catalogApiHandler(config)(() => DB);
  return {
    ...config,
    call: (method: string, url: string) => callHandler(middleware, method, url),
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

  it('passes anything else to the next middleware, touching neither read nor sync', () => {
    const { call, read, sync } = handler();

    for (const [method, url] of [
      ['GET', '/sync'],
      ['POST', ''],
      ['DELETE', ''],
      ['GET', '/unknown'],
    ] as const) {
      expect(call(method, url).nexted, `${method} ${url}`).toBe(true);
    }
    expect(read).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
});
