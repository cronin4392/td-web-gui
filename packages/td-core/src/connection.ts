/**
 * `createTDConnection(url)` — the WebSocket connection manager the
 * factory/provider layer wraps. Usable standalone with zero context.
 *
 * This module owns the *transport*: the socket lifecycle (handshake, reconnect
 * backoff, handshake watchdog, ping/pong heartbeat), the send policy (rAF
 * throttle, backpressure, disconnected-drop), and inbound routing. The two
 * stateful domains it serves are separate and socket-agnostic:
 *
 *  - **`./params`** — named bindings, echo suppression, read-only marking, and
 *    TD-announced menus.
 *  - **`./calls`** — the pending-call table and named-handler registry.
 *
 * Both take a `send` from here that already applies the guards, and neither can
 * see a `WebSocket`.
 *
 * ## Notes that aren't obvious from the code
 *  - **Lazy signal allocation** — an inbound update for an unbound name is a map
 *    miss, dropped with no allocation. Params are a broadcast bus, so dispatch
 *    cost has to scale with what the app *uses*.
 *  - **Handshake watchdog** — `welcome` **and** `snapshot` must land within a
 *    window of `onopen`. A socket opening is not the same as TD being ready.
 *  - **Disconnected sends are dropped, never queued** — queuing would only fight
 *    the snapshot resync that follows reconnect.
 *  - **Inbound `error` never tears down the socket**; it routes to `onError` /
 *    the `lastError` signal.
 *  - **WebRTC signaling is multiplexed here** — `createTDVideoStream` observes
 *    it through `subscribe()` and sends via `send()`, so this module stays
 *    ignorant of peers and forwards those `type`s untouched.
 */

import { createSignal, getOwner, onCleanup, type Accessor } from 'solid-js';
import {
  createCallRegistry,
  type AnyCalls,
  type CallOptions,
  type CallSchema,
  type CallSendResult,
} from './calls';
import { createParamRegistry, type TDBinding, type TDSendOptions } from './params';
import { defaultScheduler, type TDScheduler } from './scheduler';
import {
  isServerMessage,
  parse,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorMessage,
  type JsonValue,
  type MenuOption,
  type ParamMap,
  type ParamValue,
  type ServerMessage,
} from './wire';

export type { TDBinding, TDSendOptions } from './params';

/**
 * Connection lifecycle as a coarse reactive status. `connecting` → `open`
 * (socket opened, handshake in flight) → `synced` (snapshot applied). An
 * unexpected drop returns to `connecting` while backoff runs; `closed` is
 * terminal and only reached via `close()`/teardown.
 */
export type TDStatus = 'connecting' | 'open' | 'synced' | 'closed';

/**
 * The minimal slice of the browser `WebSocket` surface the connection uses.
 * Stated structurally (rather than as `typeof WebSocket`) so a mock TD server
 * can be injected in tests without implementing the full DOM interface.
 */
export interface WebSocketLike {
  readonly OPEN: number;
  readyState: number;
  /** Bytes buffered but not yet sent; read by the backpressure check. */
  readonly bufferedAmount?: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

/** Constructor for a {@link WebSocketLike}. */
export interface WebSocketLikeConstructor {
  new (url: string): WebSocketLike;
}

/**
 * A param schema constrained so every value is a {@link ParamValue}. Written as
 * a self-referential mapped type rather than `Record<string, ParamValue>` so
 * that plain `interface` declarations (which lack an index signature) satisfy
 * it — the `interface MixerParams { … }` style apps actually write.
 */
export type ParamSchema<Schema> = { [K in keyof Schema]: ParamValue };

/** Reconnect backoff timing. */
export interface BackoffOptions {
  /** First retry delay before jitter (ms). Default 500. */
  min?: number;
  /** Retry-delay ceiling before jitter (ms). Default 10000. */
  max?: number;
}

/** App-level heartbeat timing. */
export interface HeartbeatOptions {
  /** Interval between `ping`s once synced (ms). Default 5000. */
  interval?: number;
  /** Grace for a `pong` before forcing reconnect (ms). Default 10000. */
  timeout?: number;
}

/** Backpressure thresholds. */
export interface BackpressureOptions {
  /** `bufferedAmount` above which `update`s are skipped (bytes). Default 1 MiB. */
  highWaterMark?: number;
  /** Sustained-congestion window before forcing a reconnect (ms). Default 5000. */
  timeout?: number;
}

export interface TDConnectionOptions {
  /** Protocol version advertised in `hello`. Defaults to {@link PROTOCOL_VERSION}. */
  protocol?: number;
  /**
   * WebSocket constructor to use. Defaults to the global `WebSocket`. Injected
   * by tests to drive a mock TD server without a live socket.
   */
  WebSocket?: WebSocketLikeConstructor;
  /**
   * Timer / animation-frame scheduler. Defaults to the platform globals;
   * injected in tests to drive the timing paths deterministically.
   */
  scheduler?: TDScheduler;
  /**
   * Handler for inbound `error` messages. Defaults to a `console.error`. Never
   * fatal — the socket stays up regardless.
   */
  onError?: (error: ErrorMessage) => void;
  /** Auto-reconnect on unexpected drop. Default `true`. */
  reconnect?: boolean;
  backoff?: BackoffOptions;
  /** Handshake watchdog window in ms. Default 5000. */
  handshakeTimeout?: number;
  /** Heartbeat timing, or `false` to disable the heartbeat. */
  heartbeat?: HeartbeatOptions | false;
  backpressure?: BackpressureOptions;
  /** Timeout for an outbound `call()` awaiting its `result` (ms). Default 10000. */
  callTimeout?: number;
  /** Jitter source for backoff. Defaults to `Math.random`; injected in tests. */
  random?: () => number;
  /**
   * Names to statically declare read-only — authored beside the schema,
   * forwarded from `<Provider readonly>`. Bound controls render disabled and
   * warn in dev.
   */
  readonly?: string[];
}

/**
 * Schema-bound connection. `Schema` types parameter names, `Calls` types what TD
 * exposes for the web to invoke, and `Handlers` types what the web exposes for
 * TD to invoke. All three default to their permissive form, so a connection
 * created without them behaves exactly as an untyped one.
 */
export interface TDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
  Calls extends CallSchema<Calls> = AnyCalls,
  Handlers extends CallSchema<Handlers> = AnyCalls,
> {
  status: Accessor<TDStatus>;
  /**
   * Reactive backpressure flag: `true` while `update` sends are being skipped
   * because the socket's send buffer is over the high-water mark.
   */
  congested: Accessor<boolean>;
  lastError: Accessor<ErrorMessage | undefined>;
  /**
   * Create-or-return the shared binding for `name` (lazy allocation). All
   * callers for the same name share one signal and one editor count; a binding
   * created under a Solid owner releases its own editor marks on cleanup.
   */
  signal: <K extends keyof Schema & string>(name: K) => TDBinding<Schema[K]>;
  /**
   * Fire a momentary TD parameter. Immediate, throttle-exempt; still dropped
   * (debug-logged) while disconnected or backpressured. Holds no state — there
   * is nothing to read back.
   */
  pulse: (name: keyof Schema & string) => void;
  isReadonly: (name: string) => boolean;
  /**
   * Reactive: the menu options TD announced for `name`, or `undefined` if it
   * announced none.
   *
   * Only meaningful for params whose backing TD par is a Menu, and only for
   * projects that announce them — a `<Select>` with a web-authored `options`
   * prop never consults this. It exists for menus that *can't* be authored in
   * advance, an audio-device list being the motivating case.
   */
  menuOptions: (name: string) => MenuOption[] | undefined;
  /**
   * Ask TD to re-read and re-announce its menus — the "reload devices" action
   * beside a TD-driven `<Select>`.
   *
   * Refreshes every announced menu, not one name: TD reads them as a set, and a
   * per-name request would cost a wire field to save nothing. Dropped silently
   * while disconnected, like any other send.
   */
  requestMenus: () => void;
  /**
   * Invoke a named handler on TD, awaiting its `result`. Rejects with a
   * {@link TDCallError} on `unknown_handler`/`handler_error`/
   * `result_not_serializable` (from TD), `call_timeout` (no reply within
   * `callTimeout`), `call_disconnected` (dropped while not open, or the socket
   * closed while awaiting), or `call_congested` (backpressure).
   */
  call: <K extends keyof Calls & string>(
    name: K,
    args?: Calls[K]['args'],
    opts?: CallOptions,
  ) => Promise<Calls[K]['result']>;
  /**
   * Same as `call`, but fire-and-forget: sends a `call` with no `id` and creates
   * no pending entry. Follows `pulse`'s drop-and-debug-log behaviour while
   * disconnected or backpressured, since there is no Promise to settle.
   */
  notify: <K extends keyof Calls & string>(name: K, args?: Calls[K]['args']) => void;
  /**
   * Register a handler for a named `call` TD sends this way. Returns an
   * unregister fn (mirrors `subscribe`); registering under a name already bound
   * replaces the previous handler.
   */
  handle: <K extends keyof Handlers & string>(
    name: K,
    // `void` stays legal: a handler that only performs an effect replies with
    // no `value`, which is not the same as being unable to reply.
    fn: (
      args: Handlers[K]['args'],
    ) => Handlers[K]['result'] | void | Promise<Handlers[K]['result'] | void>,
  ) => () => void;
  /** Low-level send of a client message (no-op unless the socket is open). */
  send: (message: ClientMessage) => void;
  /**
   * Observe every parsed inbound message, *after* the connection's own handling
   * of it; returns an unsubscribe fn. Malformed, unknown-`type`, and client-only
   * frames never reach listeners.
   */
  subscribe: (listener: (message: ServerMessage) => void) => () => void;
  /** Close the socket, cancel all timers, and drop the routing table. */
  close: () => void;
}

// Timing defaults. All overridable per-connection so a slower/remote deployment
// can loosen them without a protocol change.
const DEFAULT_BACKOFF_MIN = 500;
const DEFAULT_BACKOFF_MAX = 10_000;
const DEFAULT_HANDSHAKE_TIMEOUT = 5_000;
const DEFAULT_PING_INTERVAL = 5_000;
const DEFAULT_PONG_TIMEOUT = 10_000;
const DEFAULT_HIGH_WATER_MARK = 1 << 20; // 1 MiB
const DEFAULT_CONGESTION_TIMEOUT = 5_000;
const DEFAULT_CALL_TIMEOUT = 10_000;

export function createTDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
  Calls extends CallSchema<Calls> = AnyCalls,
  Handlers extends CallSchema<Handlers> = AnyCalls,
>(url: string, options: TDConnectionOptions = {}): TDConnection<Schema, Calls, Handlers> {
  type Connection = TDConnection<Schema, Calls, Handlers>;

  const WS: WebSocketLikeConstructor = options.WebSocket ?? globalThis.WebSocket;
  const scheduler = options.scheduler ?? defaultScheduler;
  const protocol = options.protocol ?? PROTOCOL_VERSION;
  const random = options.random ?? Math.random;

  const reconnectEnabled = options.reconnect !== false;
  const backoffMin = options.backoff?.min ?? DEFAULT_BACKOFF_MIN;
  const backoffMax = options.backoff?.max ?? DEFAULT_BACKOFF_MAX;
  const handshakeTimeout = options.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT;

  const heartbeat = options.heartbeat === false ? null : (options.heartbeat ?? {});
  const pingInterval = heartbeat?.interval ?? DEFAULT_PING_INTERVAL;
  const pongTimeout = heartbeat?.timeout ?? DEFAULT_PONG_TIMEOUT;

  const highWaterMark = options.backpressure?.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
  const congestionTimeout = options.backpressure?.timeout ?? DEFAULT_CONGESTION_TIMEOUT;
  const callTimeout = options.callTimeout ?? DEFAULT_CALL_TIMEOUT;

  const [status, setStatus] = createSignal<TDStatus>('connecting');
  const [congested, setCongested] = createSignal(false);
  const [lastError, setLastError] = createSignal<ErrorMessage | undefined>(undefined);
  const listeners = new Set<(message: ServerMessage) => void>();

  let socket: WebSocketLike | null = null;
  let disposed = false;
  // Monotonic id of the current connect attempt. Bumping it invalidates the
  // previous socket's listeners (they guard on `isCurrent`), so a stale close/
  // error event from a socket we've already torn down can't drive a second
  // reconnect.
  let attemptId = 0;
  let reconnectAttempt = 0;

  let reconnectTimer: number | null = null;
  let watchdogTimer: number | null = null;
  let pingTimer: number | null = null;
  let pongTimer: number | null = null;
  let congestionTimer: number | null = null;
  let frameHandle: number | null = null;
  let awaitingPong = false;

  /** name → latest value pending this frame (throttled writes). */
  const pendingUpdates = new Map<string, ParamValue>();

  // ── timer bookkeeping ──────────────────────────────────────────────────────

  function clearReconnect() {
    if (reconnectTimer !== null) {
      scheduler.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  function clearWatchdog() {
    if (watchdogTimer !== null) {
      scheduler.clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }
  function clearHeartbeat() {
    if (pingTimer !== null) {
      scheduler.clearTimeout(pingTimer);
      pingTimer = null;
    }
    if (pongTimer !== null) {
      scheduler.clearTimeout(pongTimer);
      pongTimer = null;
    }
    awaitingPong = false;
  }
  function clearCongestionTimer() {
    if (congestionTimer !== null) {
      scheduler.clearTimeout(congestionTimer);
      congestionTimer = null;
    }
  }
  function clearFrame() {
    if (frameHandle !== null) {
      scheduler.cancelFrame(frameHandle);
      frameHandle = null;
    }
    pendingUpdates.clear();
  }

  /** Everything scoped to a single socket session (reconnect timer excepted). */
  function clearSessionTimers() {
    clearWatchdog();
    clearHeartbeat();
    clearCongestionTimer();
    clearFrame();
    if (congested()) setCongested(false);
  }

  // ── sending ────────────────────────────────────────────────────────────────

  /** Raw send of a control message; silently dropped unless the socket is open. */
  function rawSend(message: ClientMessage) {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * The one guarded send path. Reports the outcome so `calls.ts` can reject a
   * pending `call()` with the matching code, where `update`/`pulse` just drop —
   * the next frame's coalesced value supersedes a dropped update, and a stale
   * value replayed after reconnect would only fight the snapshot resync.
   */
  function guardedSend(message: ClientMessage, label: string): CallSendResult {
    if (!socket || socket.readyState !== socket.OPEN) {
      console.debug(`[td-core] dropping ${label} while disconnected`, message);
      return 'disconnected';
    }
    if ((socket.bufferedAmount ?? 0) > highWaterMark) {
      markCongested();
      console.debug(`[td-core] backpressure: dropping ${label}`, message);
      return 'congested';
    }
    socket.send(JSON.stringify(message));
    clearCongested();
    return 'sent';
  }

  function markCongested() {
    if (!congested()) setCongested(true);
    if (congestionTimer === null) {
      // Sustained high-water is treated like a half-open socket: force a
      // reconnect if a successful send doesn't clear it within the window.
      congestionTimer = scheduler.setTimeout(() => {
        congestionTimer = null;
        reconnectNow('congestion');
      }, congestionTimeout);
    }
  }

  function clearCongested() {
    if (congested()) setCongested(false);
    clearCongestionTimer();
  }

  /** Queue a throttled update; flush the whole buffer as one message on rAF. */
  function enqueueThrottled(params: ParamMap) {
    for (const [name, value] of Object.entries(params)) pendingUpdates.set(name, value);
    if (frameHandle !== null) return;
    frameHandle = scheduler.requestFrame(() => {
      frameHandle = null;
      if (pendingUpdates.size === 0) return;
      const batched = Object.fromEntries(pendingUpdates);
      pendingUpdates.clear();
      guardedSend({ type: 'update', params: batched }, 'update');
    });
  }

  // ── domain registries ──────────────────────────────────────────────────────

  const params = createParamRegistry({
    readonly: options.readonly,
    send: (edits, sendOptions) => {
      if (sendOptions?.throttle) enqueueThrottled(edits);
      else guardedSend({ type: 'update', params: edits }, 'update');
    },
  });

  const calls = createCallRegistry({
    send: (message) => guardedSend(message, 'call'),
    scheduler,
    timeout: callTimeout,
  });

  /**
   * Never throttled, unlike an update — a pulse is a discrete event, not a
   * sampled value, so buffering it a frame would add latency and risk
   * coalescing or dropping distinct presses.
   */
  function sendPulse(name: string) {
    guardedSend({ type: 'pulse', name }, 'pulse');
  }

  // ── inbound ────────────────────────────────────────────────────────────────

  function handleMessage(raw: string) {
    const message = parse(raw);
    if (!message) {
      console.debug('[td-core] dropping unparseable/unknown message');
      return;
    }

    switch (message.type) {
      case 'welcome':
        if (message.protocol !== protocol) {
          // Closed system: warn and proceed best-effort rather than hard-reject.
          console.warn(`[td-core] protocol mismatch: web=${protocol} td=${message.protocol}`);
        }
        rawSend({ type: 'snapshot-request' });
        break;
      case 'snapshot':
        params.apply(message.params);
        onSynced();
        break;
      case 'update':
        params.apply(message.params);
        break;
      case 'pong':
        awaitingPong = false;
        if (pongTimer !== null) {
          scheduler.clearTimeout(pongTimer);
          pongTimer = null;
        }
        break;
      case 'error':
        handleError(message);
        break;
      case 'menus':
        // Replaces the announced set wholesale rather than merging: a device
        // that has been unplugged has to *disappear* from the dropdown, and a
        // merge would leave it selectable forever.
        params.setMenus(message.menus);
        break;
      case 'call':
      case 'result':
        calls.onMessage(message);
        break;
      // WebRTC signaling is not handled here — it reaches the peer through the
      // subscriber dispatch below, so this module stays ignorant of peers.
    }

    if (!isServerMessage(message)) return;
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        // A throwing subscriber must not wedge the socket's read loop.
        console.error('[td-core] message subscriber threw', error);
      }
    }
  }

  function onSynced() {
    clearWatchdog();
    reconnectAttempt = 0; // a healthy sync resets the backoff schedule
    setStatus('synced');
    startHeartbeat();
  }

  function handleError(error: ErrorMessage) {
    setLastError(error);
    if (error.code === 'param_not_writable' && error.ref) {
      // TD refused the write because the backing par isn't in CONSTANT mode (it
      // guards rather than applying — on 2025.33070 an unguarded write would
      // flip the par to CONSTANT and detach its expression for good). Mark it
      // read-only from here on and re-request a snapshot so the optimistic edit
      // that never landed snaps back rather than "sticking" until a later resync.
      params.markReadonly(error.ref);
      rawSend({ type: 'snapshot-request' });
    }
    if (options.onError) {
      options.onError(error);
    } else {
      console.error(
        `[td-core] TD error ${error.code}` +
          (error.ref ? ` (${error.ref})` : '') +
          (error.message ? `: ${error.message}` : ''),
      );
    }
  }

  // ── heartbeat ──────────────────────────────────────────────────────────────

  function startHeartbeat() {
    if (!heartbeat) return;
    clearHeartbeat();
    scheduleNextPing();
  }

  function scheduleNextPing() {
    pingTimer = scheduler.setTimeout(() => {
      pingTimer = null;
      // Rescheduled unconditionally, so the loop's only stop condition is an
      // explicit `clearHeartbeat()` — which every teardown path already calls.
      // Bailing out here instead would leave the loop dead until something else
      // happened to restart it.
      scheduleNextPing();
      if (!socket || socket.readyState !== socket.OPEN) return;
      rawSend({ type: 'ping' });
      // Arm the pong deadline only on the *first* unanswered ping. When the ping
      // interval is shorter than the pong timeout, later pings must not push the
      // deadline out — otherwise a half-open socket that never answers would
      // never trip. A `pong` clears `awaitingPong` (and the deadline), so the
      // next ping re-arms it.
      if (awaitingPong) return;
      awaitingPong = true;
      pongTimer = scheduler.setTimeout(() => {
        pongTimer = null;
        if (awaitingPong) reconnectNow('pong-timeout');
      }, pongTimeout);
    }, pingInterval);
  }

  // ── connect / reconnect ────────────────────────────────────────────────────

  function connect() {
    if (disposed) return;
    const myId = ++attemptId;
    const isCurrent = () => myId === attemptId && !disposed;

    setStatus('connecting');
    const s = new WS(url);
    socket = s;

    s.addEventListener('open', () => {
      if (!isCurrent()) return;
      setStatus('open');
      // Armed *before* `hello`: a TD that replies synchronously (the in-memory
      // mock, or a same-tick send) can complete the whole handshake inside
      // `rawSend`, and arming afterwards would leave a watchdog that `onSynced`
      // already ran past — firing a spurious reconnect on a synced socket.
      watchdogTimer = scheduler.setTimeout(() => {
        watchdogTimer = null;
        reconnectNow('handshake-timeout');
      }, handshakeTimeout);
      rawSend({ type: 'hello', protocol });
    });
    s.addEventListener('message', (event: MessageEvent) => {
      if (!isCurrent()) return;
      if (typeof event.data === 'string') handleMessage(event.data);
    });
    s.addEventListener('close', () => {
      if (isCurrent()) reconnectNow('close');
    });
    s.addEventListener('error', () => {
      if (isCurrent()) reconnectNow('error');
    });
  }

  /**
   * Tear down the current socket and schedule a reconnect — for unexpected drops
   * (close/error) and the forced cases (watchdog, pong timeout, sustained
   * congestion) alike. Bumping `attemptId` invalidates the old socket's
   * listeners so its own close event can't re-enter here.
   */
  function reconnectNow(reason: string) {
    if (disposed) return;
    attemptId++;
    clearSessionTimers();
    calls.reset(reason);
    try {
      socket?.close();
    } catch {
      // ignore — socket may already be closing
    }
    socket = null;
    setStatus('connecting');
    console.debug('[td-core] reconnecting:', reason);
    scheduleReconnect();
  }

  function scheduleReconnect() {
    if (disposed || !reconnectEnabled) return;
    if (reconnectTimer !== null) return; // already scheduled
    const base = Math.min(backoffMax, backoffMin * 2 ** reconnectAttempt);
    reconnectAttempt++;
    // Half jitter: a random point in the upper half of [0, base], so retries
    // spread out (avoids a thundering herd across up to 8 instances) while still
    // growing toward the ceiling.
    const delay = base / 2 + random() * (base / 2);
    reconnectTimer = scheduler.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function close() {
    disposed = true;
    clearReconnect();
    clearSessionTimers();
    calls.reset('closed');
    attemptId++; // invalidate any in-flight socket listeners
    try {
      socket?.close();
    } catch {
      // ignore
    }
    socket = null;
    params.clear();
    listeners.clear();
    setStatus('closed');
  }

  function subscribe(listener: (message: ServerMessage) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  connect();

  // Automatic teardown when used inside a component tree; harmless/skipped when
  // standalone (no owner). Each provider owns its own connection, so this tears
  // down only this instance.
  if (getOwner()) onCleanup(close);

  return {
    status,
    congested,
    lastError,
    signal: params.signal as Connection['signal'],
    pulse: sendPulse,
    isReadonly: params.isReadonly,
    menuOptions: params.menuOptions,
    requestMenus: () => rawSend({ type: 'menus-request' }),
    // The registry is name-agnostic by design; the generics are a compile-time
    // narrowing over the same three functions.
    call: calls.call as Connection['call'],
    notify: calls.notify as Connection['notify'],
    handle: calls.handle as Connection['handle'],
    send: rawSend,
    subscribe,
    close,
  };
}
