/**
 * Named-call channel — outbound `call`/`notify` (web → TD) and inbound
 * dispatch to registered handlers (TD → web), driven against the mock TD
 * server with a manual scheduler, following resilience.test.ts's structure.
 */

import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTDConnection, type TDConnectionOptions } from './connection';
import { createTDClient, createTDHandler } from './context';
import { createMockTD, flush } from './testing/mockTD';
import { createManualScheduler } from './testing/scheduler';

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(options: Partial<TDConnectionOptions> = {}) {
  const sched = createManualScheduler();
  const td = createMockTD({ snapshot: {} });
  const conn = createTDConnection('ws://test', {
    WebSocket: td.WebSocket,
    scheduler: sched.scheduler,
    ...options,
  });
  await flush();
  return {
    sched,
    td,
    conn,
    sent: () => td.socket().received,
    last: () => td.socket().received.at(-1) as any,
  };
}

describe('call (web → TD)', () => {
  it('sends a call frame with a generated id, resolving on a matching result', async () => {
    const { td, conn, last } = await setup();

    const promise = conn.call('print', { text: 'hi' });
    const sent = last();
    expect(sent.type).toBe('call');
    expect(sent.name).toBe('print');
    expect(sent.args).toEqual({ text: 'hi' });
    expect(typeof sent.id).toBe('string');

    td.socket().serverSend({ type: 'result', id: sent.id, value: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('rejects with the error code TD reported in the result', async () => {
    const { td, conn, last } = await setup();

    const promise = conn.call('nope');
    td.socket().serverSend({ type: 'result', id: last().id, error: { code: 'unknown_handler' } });

    await expect(promise).rejects.toMatchObject({ code: 'unknown_handler' });
  });

  it('rejects with call_timeout after callTimeout elapses with no reply', async () => {
    const { sched, conn } = await setup({ callTimeout: 5_000 });

    const promise = conn.call('print');
    const assertion = expect(promise).rejects.toMatchObject({ code: 'call_timeout' });
    sched.advance(5_000);
    await assertion;
  });

  it('rejects every pending call with call_disconnected on socket close', async () => {
    const { td, conn } = await setup({ reconnect: false });

    const a = conn.call('print');
    const b = conn.call('echo');
    td.socket().close();

    await expect(a).rejects.toMatchObject({ code: 'call_disconnected' });
    await expect(b).rejects.toMatchObject({ code: 'call_disconnected' });
  });

  it('rejects with call_disconnected when the socket is already closed', async () => {
    const { td, conn } = await setup({ reconnect: false });
    td.socket().close();

    await expect(conn.call('print')).rejects.toMatchObject({ code: 'call_disconnected' });
  });

  it('rejects with call_congested when bufferedAmount is over the high-water mark', async () => {
    const { td, conn, sent } = await setup({ backpressure: { highWaterMark: 100 } });
    td.socket().bufferedAmount = 500;
    const before = sent().length;

    await expect(conn.call('print')).rejects.toMatchObject({ code: 'call_congested' });
    expect(sent().length).toBe(before);
    expect(conn.congested()).toBe(true);
  });

  it('notify sends a call with no id and creates no pending entry', async () => {
    const { td, conn, last } = await setup();

    conn.notify('print', { text: 'hi' });
    expect(last()).toEqual({ type: 'call', name: 'print', args: { text: 'hi' } });

    // A stray `result` for an id this connection never sent settles nothing —
    // and, more importantly, must not throw.
    expect(() =>
      td.socket().serverSend({ type: 'result', id: 'stray', value: null }),
    ).not.toThrow();
  });
});

describe('call (TD → web)', () => {
  it('dispatches an inbound call to a registered handler and replies result', async () => {
    const { td, conn, last } = await setup();

    conn.handle('double', (args: any) => (args?.n ?? 0) * 2);
    td.socket().serverSend({ type: 'call', id: 'td-1', name: 'double', args: { n: 3 } });
    await flush();

    expect(last()).toEqual({ type: 'result', id: 'td-1', value: 6 });
  });

  it('awaits an async handler before replying', async () => {
    const { td, conn, sent, last } = await setup();

    let resolveHandler!: (value: number) => void;
    conn.handle('slow', () => new Promise<number>((resolve) => (resolveHandler = resolve)));
    td.socket().serverSend({ type: 'call', id: 'td-2', name: 'slow' });
    await flush();
    expect(sent().some((m: any) => m?.type === 'result')).toBe(false);

    resolveHandler(42);
    await flush();
    expect(last()).toEqual({ type: 'result', id: 'td-2', value: 42 });
  });

  it('replies handler_error when a handler throws', async () => {
    const { td, conn, last } = await setup();

    conn.handle('boom', () => {
      throw new Error('nope');
    });
    td.socket().serverSend({ type: 'call', id: 'td-3', name: 'boom' });
    await flush();

    expect(last()).toMatchObject({ type: 'result', id: 'td-3', error: { code: 'handler_error' } });
  });

  it('replies result_not_serializable when a handler returns a cycle', async () => {
    const { td, conn, last } = await setup();

    conn.handle('circular', () => {
      const value: any = {};
      value.self = value;
      return value;
    });
    td.socket().serverSend({ type: 'call', id: 'td-5', name: 'circular' });
    await flush();

    expect(last()).toEqual({
      type: 'result',
      id: 'td-5',
      error: { code: 'result_not_serializable' },
    });
  });

  it('replies unknown_handler for an unregistered name', async () => {
    const { td, last } = await setup();

    td.socket().serverSend({ type: 'call', id: 'td-4', name: 'nope' });
    await flush();

    expect(last()).toEqual({ type: 'result', id: 'td-4', error: { code: 'unknown_handler' } });
  });

  it('runs a fire-and-forget inbound call (no id) with no reply', async () => {
    const { td, conn, sent } = await setup();

    let called = false;
    conn.handle('ping', () => {
      called = true;
    });
    const before = sent().length;
    td.socket().serverSend({ type: 'call', name: 'ping' });
    await flush();

    expect(called).toBe(true);
    expect(sent().length).toBe(before);
  });
});

interface EmptyParams {}

describe('createTDHandler', () => {
  it('unregisters on unmount, so a later inbound call answers unknown_handler', async () => {
    const sched = createManualScheduler();
    const td = createMockTD({ snapshot: {} });
    const TD = createTDClient<EmptyParams>();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const [show, setShow] = createSignal(true);
    function Handler() {
      createTDHandler('greet', () => ({ ok: true }));
      return null;
    }

    const dispose = render(
      () => (
        <TD.Provider
          url="ws://test"
          options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
        >
          <Show when={show()}>
            <Handler />
          </Show>
        </TD.Provider>
      ),
      host,
    );
    await flush();

    td.socket().serverSend({ type: 'call', id: 'a', name: 'greet' });
    await flush();
    expect(td.socket().received.at(-1)).toEqual({ type: 'result', id: 'a', value: { ok: true } });

    setShow(false);
    td.socket().serverSend({ type: 'call', id: 'b', name: 'greet' });
    await flush();
    expect(td.socket().received.at(-1)).toEqual({
      type: 'result',
      id: 'b',
      error: { code: 'unknown_handler' },
    });

    dispose();
    host.remove();
  });
});

interface DemoCalls {
  print: { args: { text: string }; result: { ok: boolean } };
}

describe('createTDClient call routing', () => {
  it('routes a typed call to the mounted provider’s connection', async () => {
    const sched = createManualScheduler();
    const td = createMockTD({ snapshot: {} });
    const TD = createTDClient<EmptyParams, DemoCalls>();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(
      () => (
        <TD.Provider
          url="ws://test"
          options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
        />
      ),
      host,
    );
    await flush();

    const promise = TD.call('print', { text: 'hi' });
    const sent = td.socket().received.at(-1) as any;
    expect(sent).toMatchObject({ type: 'call', name: 'print', args: { text: 'hi' } });
    td.socket().serverSend({ type: 'result', id: sent.id, value: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });

    dispose();
    host.remove();
  });

  it('throws before any provider has mounted', () => {
    const TD = createTDClient<EmptyParams, DemoCalls>();
    expect(() => TD.call('print', { text: 'hi' })).toThrow(/no TD connection/);
  });

  // The factory resolves the connection outside Solid's owner (event handlers
  // have none), so two live providers leave nothing to disambiguate from.
  // Failing loudly beats silently binding the wrong socket.
  it('throws rather than guessing when two providers from one factory are mounted', async () => {
    const sched = createManualScheduler();
    const a = createMockTD({ snapshot: {} });
    const b = createMockTD({ snapshot: {} });
    const TD = createTDClient<EmptyParams, DemoCalls>();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(
      () => (
        <>
          <TD.Provider
            url="ws://a"
            options={{ WebSocket: a.WebSocket, scheduler: sched.scheduler }}
          />
          <TD.Provider
            url="ws://b"
            options={{ WebSocket: b.WebSocket, scheduler: sched.scheduler }}
          />
        </>
      ),
      host,
    );
    await flush();

    expect(() => TD.call('print', { text: 'hi' })).toThrow(/one createTDClient/);

    dispose();
    host.remove();
  });
});
