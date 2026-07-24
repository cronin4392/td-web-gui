/**
 * `createTDConnection(url)` — the single WebSocket connection manager that the
 * factory/provider layer wraps. Usable standalone with zero context (e.g. from
 * non-component code).
 *
 * ## Phase 2 core (the minimal end-to-end path)
 *  - Open the socket, run the handshake (`hello` → `welcome` →
 *    `snapshot-request` → apply `snapshot`), apply inbound `update`s, send local
 *    edits, expose a reactive `status` signal.
 *  - **Lazy signal allocation** — `signal(name)` creates-or-returns one signal
 *    per name; the routing table maps name → signal; an inbound update for an
 *    unbound name is a map miss, dropped with no allocation.
 *  - **Focus-based echo suppression** — each signal tracks an active-editor
 *    count; inbound TD updates for a name are suppressed while its count `> 0`.
 *
 * ## Phase 3 hardening (per-connection options, sane defaults)
 *  - **Reconnect + backoff** (3.1) — on an unexpected drop, reconnect with
 *    exponential backoff + jitter, re-running the full handshake + snapshot
 *    resync each time.
 *  - **Handshake watchdog** (3.2) — require `welcome` **and** `snapshot` within
 *    a window of `onopen`; otherwise abandon the attempt into backoff.
 *  - **`ping`/`pong` heartbeat** (3.3) — probe an *established* session; a
 *    missing `pong` forces a reconnect.
 *  - **Outbound throttle** (3.4) — `setValue(v, { throttle: true })` coalesces
 *    update sends to one rAF-aligned message per frame.
 *  - **Backpressure** (3.5) — skip `update`s while `bufferedAmount` is over a
 *    high-water mark; flip a `congested` flag; sustained congestion forces a
 *    reconnect.
 *  - **Disconnected sends + errors** (3.6) — updates written while not open are
 *    dropped (debug-logged), never queued; inbound `error` messages route to
 *    `onError` / the `lastError` signal without tearing down the socket.
 *  - **Teardown** (3.7) — `close()` cancels every timer, closes the socket, and
 *    drops the routing table; registered on `onCleanup` when owned.
 *
 * ## Phase 4 additions
 *  - **`pulse(name)`** (4.3) — fires a momentary TD parameter. Throttle-exempt
 *    (always sent immediately) but still honors the disconnected-drop and
 *    backpressure rules; holds no state, so it bypasses the routing table
 *    entirely.
 *  - **Read-only params** (4.10) — a statically-declared `readonly` name set
 *    (authored beside the schema, forwarded from `<Provider readonly>`) plus a
 *    runtime safety net: an inbound `param_not_writable` error marks that name
 *    read-only from then on and re-requests a snapshot to revert whatever
 *    optimistic edit just got silently ignored by TD.
 */

import { batch, createSignal, getOwner, onCleanup, type Accessor } from 'solid-js'
import { defaultScheduler, type TDScheduler } from './scheduler'
import {
  parse,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorMessage,
  type ParamMap,
  type ParamValue,
} from './wire'

/**
 * Connection lifecycle as a coarse reactive status. `connecting` → `open`
 * (socket opened, handshake in flight) → `synced` (snapshot applied). An
 * unexpected drop returns to `connecting` while backoff runs; `closed` is
 * terminal and only reached via `close()`/teardown.
 */
export type TDStatus = 'connecting' | 'open' | 'synced' | 'closed'

/** Options for the per-write send path (see {@link TDBinding.setValue}). */
export interface TDSendOptions {
  /**
   * Coalesce this send with any other throttled writes in the same animation
   * frame into a single `update` message (Phase 3.4). The optimistic local
   * write still happens immediately; only the wire send is deferred to the frame
   * boundary. Defaults to `false` (send immediately).
   */
  throttle?: boolean
}

/**
 * A live binding to one named TD parameter. Returned by `connection.signal()`
 * and (via context) by `createTDSignal`. Multiple binders of the same name
 * share one underlying signal, so optimistic writes fan out to all of them.
 */
export interface TDBinding<T extends ParamValue = ParamValue> {
  /** Reactive accessor for the current value (`undefined` until first synced). */
  value: Accessor<T | undefined>
  /** Optimistic local write: updates the shared signal *and* sends an `update`. */
  setValue: (value: T, options?: TDSendOptions) => void
  /** Mark this binder as actively editing (focus / drag-start). */
  beginEdit: () => void
  /** Release the active-editing mark (blur / drag-end). */
  endEdit: () => void
  /**
   * Reactive: whether this name is currently read-only (Phase 4.10) — either
   * statically declared via `<Provider readonly>`, or marked so at runtime by
   * an inbound `param_not_writable` error. Bound controls disable on this.
   */
  readonly: Accessor<boolean>
}

/** Per-name routing entry: the shared signal plus its active-editor count. */
interface SignalEntry {
  read: Accessor<ParamValue | undefined>
  write: (value: ParamValue | undefined) => void
  editors: number
}

/**
 * The minimal slice of the browser `WebSocket` surface the connection uses.
 * Stated structurally (rather than as `typeof WebSocket`) so a mock TD server
 * can be injected in tests without implementing the full DOM interface.
 */
export interface WebSocketLike {
  readonly OPEN: number
  readyState: number
  /** Bytes buffered but not yet sent; read by the backpressure check (3.5). */
  readonly bufferedAmount?: number
  send(data: string): void
  close(): void
  addEventListener(type: string, listener: (event: any) => void): void
}

/** Constructor for a {@link WebSocketLike}. */
export interface WebSocketLikeConstructor {
  new (url: string): WebSocketLike
}

/**
 * A param schema constrained so every value is a {@link ParamValue}. Written as
 * a self-referential mapped type rather than `Record<string, ParamValue>` so
 * that plain `interface` declarations (which lack an index signature) satisfy
 * it — the proposal's `interface MixerParams { … }` style.
 */
export type ParamSchema<Schema> = { [K in keyof Schema]: ParamValue }

/** Reconnect backoff timing (Phase 3.1). */
export interface BackoffOptions {
  /** First retry delay before jitter (ms). Default 500. */
  min?: number
  /** Retry-delay ceiling before jitter (ms). Default 10000. */
  max?: number
}

/** App-level heartbeat timing (Phase 3.3). */
export interface HeartbeatOptions {
  /** Interval between `ping`s once synced (ms). Default 5000. */
  interval?: number
  /** Grace for a `pong` before forcing reconnect (ms). Default 10000. */
  timeout?: number
}

/** Backpressure thresholds (Phase 3.5). */
export interface BackpressureOptions {
  /** `bufferedAmount` above which `update`s are skipped (bytes). Default 1 MiB. */
  highWaterMark?: number
  /** Sustained-congestion window before forcing a reconnect (ms). Default 5000. */
  timeout?: number
}

export interface TDConnectionOptions {
  /** Protocol version advertised in `hello`. Defaults to {@link PROTOCOL_VERSION}. */
  protocol?: number
  /**
   * WebSocket constructor to use. Defaults to the global `WebSocket`. Injected
   * by tests to drive a mock TD server without a live socket.
   */
  WebSocket?: WebSocketLikeConstructor
  /**
   * Timer / animation-frame scheduler. Defaults to the platform globals;
   * injected in tests to drive the Phase 3 timing paths deterministically.
   */
  scheduler?: TDScheduler
  /**
   * Handler for inbound `error` messages. Defaults to a `console.error`. Never
   * fatal — the socket stays up regardless.
   */
  onError?: (error: ErrorMessage) => void
  /** Auto-reconnect on unexpected drop (Phase 3.1). Default `true`. */
  reconnect?: boolean
  /** Reconnect backoff timing (Phase 3.1). */
  backoff?: BackoffOptions
  /** Handshake watchdog window in ms (Phase 3.2). Default 5000. */
  handshakeTimeout?: number
  /** Heartbeat timing (Phase 3.3), or `false` to disable the heartbeat. */
  heartbeat?: HeartbeatOptions | false
  /** Backpressure thresholds (Phase 3.5). */
  backpressure?: BackpressureOptions
  /** Jitter source for backoff. Defaults to `Math.random`; injected in tests. */
  random?: () => number
  /**
   * Names to statically declare read-only (Phase 4.10) — authored beside the
   * schema, forwarded from `<Provider readonly>`. Bound controls render
   * disabled and warn in dev; never sent over the wire.
   */
  readonly?: string[]
}

/** Schema-bound connection; defaults to an open `name → value` map. */
export interface TDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
> {
  /** Reactive connection status. */
  status: Accessor<TDStatus>
  /**
   * Reactive backpressure flag (Phase 3.5): `true` while `update` sends are
   * being skipped because the socket's send buffer is over the high-water mark.
   */
  congested: Accessor<boolean>
  /** The most recent inbound `error` message, if any (Phase 3.6). */
  lastError: Accessor<ErrorMessage | undefined>
  /**
   * Create-or-return the shared binding for `name` (lazy allocation). All
   * callers for the same name share one signal and one editor count.
   */
  signal: <K extends keyof Schema & string>(name: K) => TDBinding<Schema[K]>
  /**
   * Fire a momentary TD parameter (Phase 4.3). Immediate, throttle-exempt;
   * still dropped (debug-logged) while disconnected or backpressured. Holds no
   * state — there is nothing to read back.
   */
  pulse: (name: keyof Schema & string) => void
  /** Reactive: whether `name` is currently read-only (Phase 4.10). */
  isReadonly: (name: string) => boolean
  /** Low-level send of a client message (no-op unless the socket is open). */
  send: (message: ClientMessage) => void
  /** Close the socket, cancel all timers, and drop the routing table. */
  close: () => void
}

// Phase 3 timing defaults. All overridable per-connection so a slower/remote
// deployment can loosen them without a protocol change (see § "Connection
// resilience" — "Timing constants are configurable with sane defaults").
const DEFAULT_BACKOFF_MIN = 500
const DEFAULT_BACKOFF_MAX = 10_000
const DEFAULT_HANDSHAKE_TIMEOUT = 5_000
const DEFAULT_PING_INTERVAL = 5_000
const DEFAULT_PONG_TIMEOUT = 10_000
const DEFAULT_HIGH_WATER_MARK = 1 << 20 // 1 MiB
const DEFAULT_CONGESTION_TIMEOUT = 5_000

export function createTDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
>(url: string, options: TDConnectionOptions = {}): TDConnection<Schema> {
  const WS: WebSocketLikeConstructor = options.WebSocket ?? globalThis.WebSocket
  const scheduler = options.scheduler ?? defaultScheduler
  const protocol = options.protocol ?? PROTOCOL_VERSION
  const random = options.random ?? Math.random

  const reconnectEnabled = options.reconnect !== false
  const backoffMin = options.backoff?.min ?? DEFAULT_BACKOFF_MIN
  const backoffMax = options.backoff?.max ?? DEFAULT_BACKOFF_MAX
  const handshakeTimeout = options.handshakeTimeout ?? DEFAULT_HANDSHAKE_TIMEOUT

  const heartbeat = options.heartbeat === false ? null : (options.heartbeat ?? {})
  const pingInterval = heartbeat?.interval ?? DEFAULT_PING_INTERVAL
  const pongTimeout = heartbeat?.timeout ?? DEFAULT_PONG_TIMEOUT

  const highWaterMark = options.backpressure?.highWaterMark ?? DEFAULT_HIGH_WATER_MARK
  const congestionTimeout = options.backpressure?.timeout ?? DEFAULT_CONGESTION_TIMEOUT

  const [status, setStatus] = createSignal<TDStatus>('connecting')
  const [congested, setCongested] = createSignal(false)
  const [lastError, setLastError] = createSignal<ErrorMessage | undefined>(undefined)
  const [readonlyNames, setReadonlyNames] = createSignal<ReadonlySet<string>>(
    new Set(options.readonly ?? []),
  )
  const entries = new Map<string, SignalEntry>()

  let socket: WebSocketLike | null = null
  let disposed = false
  // Monotonic id of the current connect attempt. Bumping it invalidates the
  // previous socket's listeners (they guard on `isCurrent`), so a stale close/
  // error event from a socket we've already torn down can't drive a second
  // reconnect.
  let attemptId = 0
  let reconnectAttempt = 0

  let reconnectTimer: number | null = null
  let watchdogTimer: number | null = null
  let pingTimer: number | null = null
  let pongTimer: number | null = null
  let congestionTimer: number | null = null
  let frameHandle: number | null = null
  let awaitingPong = false

  // Throttle buffer (3.4): name → latest value pending this frame.
  const pendingUpdates = new Map<string, ParamValue>()

  // ── timer bookkeeping ──────────────────────────────────────────────────────

  function clearReconnect() {
    if (reconnectTimer !== null) {
      scheduler.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }
  function clearWatchdog() {
    if (watchdogTimer !== null) {
      scheduler.clearTimeout(watchdogTimer)
      watchdogTimer = null
    }
  }
  function clearHeartbeat() {
    if (pingTimer !== null) {
      scheduler.clearTimeout(pingTimer)
      pingTimer = null
    }
    if (pongTimer !== null) {
      scheduler.clearTimeout(pongTimer)
      pongTimer = null
    }
    awaitingPong = false
  }
  function clearCongestionTimer() {
    if (congestionTimer !== null) {
      scheduler.clearTimeout(congestionTimer)
      congestionTimer = null
    }
  }
  function clearFrame() {
    if (frameHandle !== null) {
      scheduler.cancelFrame(frameHandle)
      frameHandle = null
    }
    pendingUpdates.clear()
  }

  /** Everything scoped to a single socket session (reconnect timer excepted). */
  function clearSessionTimers() {
    clearWatchdog()
    clearHeartbeat()
    clearCongestionTimer()
    clearFrame()
    if (congested()) setCongested(false)
  }

  // ── sending ────────────────────────────────────────────────────────────────

  /** Raw send of a control message; silently dropped unless the socket is open. */
  function rawSend(message: ClientMessage) {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }

  /**
   * Send an `update`, honoring the disconnected-drop rule (3.6) and backpressure
   * (3.5). Dropping is correct for both: the next frame's coalesced value
   * supersedes a dropped update, and a stale value replayed after reconnect
   * would only fight the snapshot resync.
   */
  function sendUpdate(params: ParamMap) {
    if (!socket || socket.readyState !== socket.OPEN) {
      console.debug('[td-core] dropping update while disconnected', params)
      return
    }
    if ((socket.bufferedAmount ?? 0) > highWaterMark) {
      markCongested()
      console.debug('[td-core] backpressure: dropping update', params)
      return
    }
    socket.send(JSON.stringify({ type: 'update', params }))
    clearCongested()
  }

  function markCongested() {
    if (!congested()) setCongested(true)
    if (congestionTimer === null) {
      // Sustained high-water is treated like a half-open socket: force a
      // reconnect if a successful send doesn't clear it within the window.
      congestionTimer = scheduler.setTimeout(() => {
        congestionTimer = null
        reconnectNow('congestion')
      }, congestionTimeout)
    }
  }

  function clearCongested() {
    if (congested()) setCongested(false)
    clearCongestionTimer()
  }

  /** Queue a throttled update; flush the whole buffer as one message on rAF. */
  function enqueueThrottled(name: string, value: ParamValue) {
    pendingUpdates.set(name, value)
    if (frameHandle === null) {
      frameHandle = scheduler.requestFrame(() => {
        frameHandle = null
        if (pendingUpdates.size === 0) return
        const params = Object.fromEntries(pendingUpdates)
        pendingUpdates.clear()
        sendUpdate(params)
      })
    }
  }

  // ── read-only params (4.10) ────────────────────────────────────────────────

  function isReadonly(name: string): boolean {
    return readonlyNames().has(name)
  }

  /** Mark `name` read-only from now on (runtime safety net for `param_not_writable`). */
  function markReadonly(name: string) {
    setReadonlyNames((prev) => {
      if (prev.has(name)) return prev
      const next = new Set(prev)
      next.add(name)
      return next
    })
  }

  /**
   * Fire a momentary parameter. Same disconnected-drop / backpressure rules as
   * `sendUpdate`, but never throttled — a pulse is a discrete event, not a
   * sampled value, so buffering it a frame would add latency and risk
   * coalescing or dropping distinct presses (see § "Outbound throttle").
   */
  function sendPulse(name: string) {
    if (!socket || socket.readyState !== socket.OPEN) {
      console.debug('[td-core] dropping pulse while disconnected', name)
      return
    }
    if ((socket.bufferedAmount ?? 0) > highWaterMark) {
      markCongested()
      console.debug('[td-core] backpressure: dropping pulse', name)
      return
    }
    socket.send(JSON.stringify({ type: 'pulse', name }))
    clearCongested()
  }

  // ── inbound ──────────────────────────────────────────────────────────────

  /** Apply a `params` map to bound signals, respecting echo suppression. */
  function applyParams(params: ParamMap) {
    // One reactive flush per message regardless of how many params it carries.
    batch(() => {
      for (const name of Object.keys(params)) {
        const entry = entries.get(name)
        if (!entry) continue // unbound name → map miss, dropped (no allocation)
        if (entry.editors > 0) continue // local edit wins while focused/dragging
        entry.write(params[name])
      }
    })
  }

  function handleMessage(raw: string) {
    const message = parse(raw)
    if (!message) {
      // Malformed JSON or unknown type → dropped, socket stays up (3.6).
      console.debug('[td-core] dropping unparseable/unknown message')
      return
    }

    switch (message.type) {
      case 'welcome':
        if (message.protocol !== protocol) {
          // Closed system: warn and proceed best-effort rather than hard-reject.
          console.warn(
            `[td-core] protocol mismatch: web=${protocol} td=${message.protocol}`,
          )
        }
        rawSend({ type: 'snapshot-request' })
        break
      case 'snapshot':
        applyParams(message.params)
        onSynced()
        break
      case 'update':
        applyParams(message.params)
        break
      case 'pong':
        awaitingPong = false
        if (pongTimer !== null) {
          scheduler.clearTimeout(pongTimer)
          pongTimer = null
        }
        break
      case 'error':
        handleError(message)
        break
      // Client-only types (hello / snapshot-request / ping) are never expected
      // inbound; ignored if they somehow arrive.
    }
  }

  function onSynced() {
    clearWatchdog()
    reconnectAttempt = 0 // a healthy sync resets the backoff schedule
    setStatus('synced')
    startHeartbeat()
  }

  function handleError(error: ErrorMessage) {
    setLastError(error)
    if (error.code === 'param_not_writable' && error.ref) {
      // Runtime safety net: TD silently no-ops a write to a non-CONSTANT par.
      // Mark it read-only from here on (disables the control) and re-request a
      // snapshot so the optimistic edit that just got ignored snaps back to
      // TD's real value rather than "sticking" until an unrelated resync.
      markReadonly(error.ref)
      rawSend({ type: 'snapshot-request' })
    }
    if (options.onError) {
      options.onError(error)
    } else {
      console.error(
        `[td-core] TD error ${error.code}` +
          (error.ref ? ` (${error.ref})` : '') +
          (error.message ? `: ${error.message}` : ''),
      )
    }
  }

  // ── heartbeat (3.3) ────────────────────────────────────────────────────────

  function startHeartbeat() {
    if (!heartbeat) return
    clearHeartbeat()
    scheduleNextPing()
  }

  function scheduleNextPing() {
    pingTimer = scheduler.setTimeout(() => {
      pingTimer = null
      if (!socket || socket.readyState !== socket.OPEN) return
      rawSend({ type: 'ping' })
      // Arm the pong deadline only on the *first* unanswered ping. When the ping
      // interval is shorter than the pong timeout, later pings must not push the
      // deadline out — otherwise a half-open socket that never answers would
      // never trip. A `pong` clears `awaitingPong` (and the deadline), so the
      // next ping re-arms it.
      if (!awaitingPong) {
        awaitingPong = true
        pongTimer = scheduler.setTimeout(() => {
          pongTimer = null
          if (awaitingPong) reconnectNow('pong-timeout')
        }, pongTimeout)
      }
      scheduleNextPing()
    }, pingInterval)
  }

  // ── connect / reconnect (3.1, 3.2) ─────────────────────────────────────────

  function connect() {
    if (disposed) return
    const myId = ++attemptId
    const isCurrent = () => myId === attemptId && !disposed

    setStatus('connecting')
    const s = new WS(url)
    socket = s

    s.addEventListener('open', () => {
      if (!isCurrent()) return
      setStatus('open')
      // Arm the handshake watchdog *before* sending `hello`: welcome+snapshot
      // must land within the window, else abandon into backoff. It's cleared the
      // moment `snapshot` applies (onSynced). Arming first matters because a TD
      // that replies synchronously (e.g. the in-memory mock, or a same-tick
      // send) can complete the whole handshake inside `rawSend` — arming after
      // would leave a watchdog that onSynced already ran past, and it would fire
      // a spurious reconnect on an already-synced socket.
      watchdogTimer = scheduler.setTimeout(() => {
        watchdogTimer = null
        reconnectNow('handshake-timeout')
      }, handshakeTimeout)
      rawSend({ type: 'hello', protocol })
    })
    s.addEventListener('message', (event: MessageEvent) => {
      if (!isCurrent()) return
      if (typeof event.data === 'string') handleMessage(event.data)
    })
    s.addEventListener('close', () => {
      if (!isCurrent()) return
      reconnectNow('close')
    })
    s.addEventListener('error', () => {
      if (!isCurrent()) return
      reconnectNow('error')
    })
  }

  /**
   * Tear down the current socket and schedule a reconnect. Used for both
   * unexpected drops (close/error) and the forced cases (watchdog, pong
   * timeout, sustained congestion). Bumping `attemptId` invalidates the old
   * socket's listeners so its own close event can't re-enter here.
   */
  function reconnectNow(reason: string) {
    if (disposed) return
    attemptId++
    clearSessionTimers()
    try {
      socket?.close()
    } catch {
      // ignore — socket may already be closing
    }
    socket = null
    setStatus('connecting')
    console.debug('[td-core] reconnecting:', reason)
    scheduleReconnect()
  }

  function scheduleReconnect() {
    if (disposed || !reconnectEnabled) return
    if (reconnectTimer !== null) return // already scheduled
    const base = Math.min(backoffMax, backoffMin * 2 ** reconnectAttempt)
    reconnectAttempt++
    // Half jitter: a random point in the upper half of [0, base], so retries
    // spread out (avoids a thundering herd across up to 8 instances) while still
    // growing toward the ceiling.
    const delay = base / 2 + random() * (base / 2)
    reconnectTimer = scheduler.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  // ── bindings ───────────────────────────────────────────────────────────────

  function signal<K extends keyof Schema & string>(name: K): TDBinding<Schema[K]> {
    let entry = entries.get(name)
    if (!entry) {
      const [read, setRaw] = createSignal<ParamValue | undefined>(undefined)
      entry = {
        read,
        // Wrap in a thunk so array values are never mistaken for Solid updaters.
        write: (value) => setRaw(() => value),
        editors: 0,
      }
      entries.set(name, entry)
    }

    if (isReadonly(name)) {
      console.warn(`[td-core] "${name}" is bound to a read-only param — control disabled`)
    }

    const bound = entry
    return {
      value: bound.read as Accessor<Schema[K] | undefined>,
      setValue: (value, sendOptions) => {
        bound.write(value) // optimistic: UI updates before any TD echo
        if (sendOptions?.throttle) enqueueThrottled(name, value)
        else sendUpdate({ [name]: value })
      },
      beginEdit: () => {
        bound.editors++
      },
      endEdit: () => {
        if (bound.editors > 0) bound.editors--
      },
      readonly: () => isReadonly(name),
    }
  }

  function close() {
    disposed = true
    clearReconnect()
    clearSessionTimers()
    attemptId++ // invalidate any in-flight socket listeners
    try {
      socket?.close()
    } catch {
      // ignore
    }
    socket = null
    entries.clear() // drop routing table + per-param signals (3.7)
    setStatus('closed')
  }

  connect()

  // Automatic teardown when used inside a component tree; harmless/skipped when
  // standalone (no owner). Each provider owns its own connection, so this tears
  // down only this instance (3.7).
  if (getOwner()) onCleanup(close)

  return {
    status,
    congested,
    lastError,
    signal,
    pulse: sendPulse,
    isReadonly,
    send: rawSend,
    close,
  }
}
