import { describe, expect, it, vi } from 'vitest';
import { createTDConnection } from './connection';
import { createMockTD, flush } from './testing/mockTD';

describe('createTDConnection', () => {
  it('runs the handshake and reaches synced', async () => {
    const td = createMockTD({ snapshot: { opacity: 0.3, text1: 'hi' } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });

    expect(conn.status()).toBe('connecting');
    await flush();

    // hello → welcome → snapshot-request → snapshot
    const sent = td.socket().received;
    expect(sent[0]).toEqual({ type: 'hello', protocol: 1 });
    expect(sent[1]).toEqual({ type: 'snapshot-request' });
    expect(conn.status()).toBe('synced');
  });

  it('applies snapshot values to bound signals', async () => {
    const td = createMockTD({ snapshot: { opacity: 0.3, text1: 'hi' } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const opacity = conn.signal('opacity');
    const text1 = conn.signal('text1');

    await flush();

    expect(opacity.value()).toBe(0.3);
    expect(text1.value()).toBe('hi');
  });

  it('applies inbound updates after sync', async () => {
    const td = createMockTD({ snapshot: { speed: 1 } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const speed = conn.signal('speed');
    await flush();
    expect(speed.value()).toBe(1);

    td.socket().serverSend({ type: 'update', params: { speed: 4 } });
    expect(speed.value()).toBe(4);
  });

  it('lazily allocates one shared signal per name', async () => {
    const td = createMockTD();
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const a = conn.signal('speed');
    const b = conn.signal('speed');
    await flush();

    // Same underlying signal: a write to one is visible through the other.
    td.socket().serverSend({ type: 'update', params: { speed: 9 } });
    expect(a.value()).toBe(9);
    expect(b.value()).toBe(9);
  });

  it('drops updates for unbound names (map miss, no allocation)', async () => {
    const td = createMockTD();
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    await flush();

    // No signal bound for "ghost"; this should be a no-op, not a crash.
    expect(() => td.socket().serverSend({ type: 'update', params: { ghost: 1 } })).not.toThrow();

    // Binding it afterward starts undefined — the earlier update was dropped.
    const ghost = conn.signal('ghost');
    expect(ghost.value()).toBeUndefined();
  });

  it('optimistic setValue updates the signal and sends an update', async () => {
    const td = createMockTD({ snapshot: { opacity: 0.1 } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const opacity = conn.signal('opacity');
    await flush();

    opacity.setValue(0.75);
    expect(opacity.value()).toBe(0.75); // optimistic, before any echo
    expect(td.socket().received.at(-1)).toEqual({
      type: 'update',
      params: { opacity: 0.75 },
    });
  });

  it('does not send while the socket is not open', () => {
    const td = createMockTD();
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const opacity = conn.signal('opacity');

    // Before the open microtask fires, sends are dropped (not queued).
    opacity.setValue(0.5);
    expect(td.socket().received).toHaveLength(0);
    expect(opacity.value()).toBe(0.5); // local optimistic write still happens
  });

  it('survives a malformed inbound frame without tearing down', async () => {
    const td = createMockTD({ snapshot: { speed: 1 } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    const speed = conn.signal('speed');
    await flush();

    td.socket().serverSendRaw('{ this is not json');
    td.socket().serverSendRaw('"a bare string"');
    // Connection still processes the next valid message.
    td.socket().serverSend({ type: 'update', params: { speed: 7 } });

    expect(conn.status()).toBe('synced');
    expect(speed.value()).toBe(7);
  });

  it('warns but proceeds on a protocol mismatch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const td = createMockTD({ protocol: 99, snapshot: { speed: 1 } });
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    await flush();

    expect(warn).toHaveBeenCalled();
    expect(conn.status()).toBe('synced'); // best-effort, not a hard reject
    warn.mockRestore();
  });

  it('close() stops the connection and reports closed', async () => {
    const td = createMockTD();
    const conn = createTDConnection('ws://test', { WebSocket: td.WebSocket });
    await flush();

    conn.close();
    expect(conn.status()).toBe('closed');
    expect(td.socket().readyState).toBe(td.socket().CLOSED);
  });
});
