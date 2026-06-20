/**
 * `createTDConnection(url)` — the single WebSocket connection manager that the
 * factory/provider layer wraps. Usable standalone with zero context (e.g. from
 * non-component code).
 *
 * Phase 2 scope is the minimal end-to-end path: open the socket, run the
 * handshake (`hello` → `welcome` → `snapshot-request` → apply `snapshot`),
 * apply inbound `update`s, send local edits, and expose a reactive `status`
 * signal. No reconnect, throttle, backpressure, watchdog, or heartbeat yet —
 * those are Phase 3.
 *
 * Two behaviors land here that the proposal calls out specifically:
 *  - **Lazy signal allocation** — `signal(name)` creates-or-returns one signal
 *    per name. The routing table maps name → signal; an inbound update for an
 *    unbound name is a map miss and is dropped with no allocation.
 *  - **Focus-based echo suppression** — each signal tracks an active-editor
 *    count; inbound TD updates for a name are suppressed while its count is
 *    `> 0`, so a local edit wins while the input is focused/being dragged.
 */

import { batch, createSignal, getOwner, onCleanup, type Accessor } from 'solid-js'
import {
  parse,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ParamMap,
  type ParamValue,
} from './wire'

/**
 * Connection lifecycle as a coarse reactive status. `connecting` → `open`
 * (socket opened, handshake in flight) → `synced` (snapshot applied). `closed`
 * is terminal in Phase 2 (reconnect arrives in Phase 3).
 */
export type TDStatus = 'connecting' | 'open' | 'synced' | 'closed'

/**
 * A live binding to one named TD parameter. Returned by `connection.signal()`
 * and (via context) by `createTDSignal`. Multiple binders of the same name
 * share one underlying signal, so optimistic writes fan out to all of them.
 */
export interface TDBinding<T extends ParamValue = ParamValue> {
  /** Reactive accessor for the current value (`undefined` until first synced). */
  value: Accessor<T | undefined>
  /** Optimistic local write: updates the shared signal *and* sends an `update`. */
  setValue: (value: T) => void
  /** Mark this binder as actively editing (focus / drag-start). */
  beginEdit: () => void
  /** Release the active-editing mark (blur / drag-end). */
  endEdit: () => void
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

export interface TDConnectionOptions {
  /** Protocol version advertised in `hello`. Defaults to {@link PROTOCOL_VERSION}. */
  protocol?: number
  /**
   * WebSocket constructor to use. Defaults to the global `WebSocket`. Injected
   * by tests to drive a mock TD server without a live socket.
   */
  WebSocket?: WebSocketLikeConstructor
}

/** Schema-bound connection; defaults to an open `name → value` map. */
export interface TDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
> {
  /** Reactive connection status. */
  status: Accessor<TDStatus>
  /**
   * Create-or-return the shared binding for `name` (lazy allocation). All
   * callers for the same name share one signal and one editor count.
   */
  signal: <K extends keyof Schema & string>(name: K) => TDBinding<Schema[K]>
  /** Low-level send of a client message (no-op unless the socket is open). */
  send: (message: ClientMessage) => void
  /** Close the socket and stop processing (terminal in Phase 2). */
  close: () => void
}

export function createTDConnection<
  Schema extends ParamSchema<Schema> = Record<string, ParamValue>,
>(url: string, options: TDConnectionOptions = {}): TDConnection<Schema> {
  const WS: WebSocketLikeConstructor = options.WebSocket ?? globalThis.WebSocket
  const protocol = options.protocol ?? PROTOCOL_VERSION

  const [status, setStatus] = createSignal<TDStatus>('connecting')
  const entries = new Map<string, SignalEntry>()

  let ws: WebSocketLike | null = null
  let closed = false

  function send(message: ClientMessage) {
    // Phase 2: drop sends unless the socket is actually open. Queueing while
    // disconnected is explicitly out of scope (see § "Connection resilience").
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

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
    if (!message) return // malformed JSON or unknown type → dropped, socket stays up

    switch (message.type) {
      case 'welcome':
        if (message.protocol !== protocol) {
          // Closed system: warn and proceed best-effort rather than hard-reject.
          console.warn(
            `[td-core] protocol mismatch: web=${protocol} td=${message.protocol}`,
          )
        }
        send({ type: 'snapshot-request' })
        break
      case 'snapshot':
        applyParams(message.params)
        setStatus('synced')
        break
      case 'update':
        applyParams(message.params)
        break
      // Client-only types (hello / snapshot-request) are never expected inbound;
      // ignored if they somehow arrive.
    }
  }

  function connect() {
    ws = new WS(url)
    ws.addEventListener('open', () => {
      if (closed) return
      setStatus('open')
      send({ type: 'hello', protocol })
    })
    ws.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') handleMessage(event.data)
    })
    ws.addEventListener('close', () => {
      if (!closed) setStatus('closed')
    })
    // Phase 3 owns reconnect/backoff; in Phase 2 an error just rides into close.
    ws.addEventListener('error', () => {})
  }

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

    const bound = entry
    return {
      value: bound.read as Accessor<Schema[K] | undefined>,
      setValue: (value) => {
        bound.write(value) // optimistic: UI updates before any TD echo
        send({ type: 'update', params: { [name]: value } })
      },
      beginEdit: () => {
        bound.editors++
      },
      endEdit: () => {
        if (bound.editors > 0) bound.editors--
      },
    }
  }

  function close() {
    closed = true
    setStatus('closed')
    ws?.close()
  }

  connect()

  // Automatic teardown when used inside a component tree; harmless/skipped when
  // standalone (no owner). Full teardown of timers/peers arrives in Phase 3.
  if (getOwner()) onCleanup(close)

  return { status, signal, send, close }
}
