/**
 * Mock TD WebSocket server (Phase 2.6) — a deterministic, in-memory stand-in
 * for a TouchDesigner Web Server DAT, used to exercise the wire contract in CI
 * without a live `.toe`.
 *
 * It implements the browser `WebSocket` surface the connection actually uses
 * (`readyState`, the `OPEN` constant, `addEventListener`, `send`, `close`) and
 * lets a test script the server side: respond to `hello` with `welcome`, to
 * `snapshot-request` with `snapshot`, push `update`s, or inject a malformed
 * frame.
 *
 * The socket opens on a microtask (not synchronously in the constructor) so the
 * connection has attached its listeners first — matching real WebSocket timing.
 */

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

type Listener = (event: any) => void

export class MockTDSocket {
  static readonly CONNECTING = CONNECTING
  static readonly OPEN = OPEN
  static readonly CLOSING = CLOSING
  static readonly CLOSED = CLOSED

  readonly CONNECTING = CONNECTING
  readonly OPEN = OPEN
  readonly CLOSING = CLOSING
  readonly CLOSED = CLOSED

  readyState: number = CONNECTING
  url: string

  /**
   * Bytes queued but not yet transmitted. Real `WebSocket` exposes this; the
   * backpressure path (Phase 3.5) reads it. Tests set it to simulate a socket
   * TD has stopped draining.
   */
  bufferedAmount = 0

  /** Raw frames the client (connection) has sent, in order. */
  readonly sent: string[] = []
  /** Parsed frames the client has sent, in order. */
  readonly received: unknown[] = []

  /** Server-side hook: invoked with each parsed client message and this socket. */
  onClientMessage?: (message: any, socket: MockTDSocket) => void

  private readonly listeners: Record<string, Listener[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  }

  constructor(url: string) {
    this.url = url
    queueMicrotask(() => this.open())
  }

  addEventListener(type: string, listener: Listener): void {
    ;(this.listeners[type] ??= []).push(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners[type]
    if (!list) return
    const i = list.indexOf(listener)
    if (i >= 0) list.splice(i, 1)
  }

  send(data: string): void {
    if (this.readyState !== OPEN) return
    this.sent.push(data)
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      parsed = undefined
    }
    this.received.push(parsed)
    this.onClientMessage?.(parsed, this)
  }

  close(): void {
    if (this.readyState === CLOSED) return
    this.readyState = CLOSED
    this.emit('close', { type: 'close' })
  }

  /** Server → client: push a structured message to the connection. */
  serverSend(message: unknown): void {
    this.emit('message', { type: 'message', data: JSON.stringify(message) })
  }

  /** Server → client: push a raw (possibly malformed) frame. */
  serverSendRaw(raw: string): void {
    this.emit('message', { type: 'message', data: raw })
  }

  /** Simulate a transport error event. */
  serverError(): void {
    this.emit('error', { type: 'error' })
  }

  private open(): void {
    if (this.readyState !== CONNECTING) return
    this.readyState = OPEN
    this.emit('open', { type: 'open' })
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }
}

export interface MockTDOptions {
  /** Protocol version the server reports in `welcome`. */
  protocol?: number
  /** Optional instance metadata in `welcome`. */
  instance?: string
  /** Params returned in the `snapshot` reply to `snapshot-request`. */
  snapshot?: Record<string, unknown>
  /**
   * Menu options announced for menu-backed params (Phase 6.2). Sent **before**
   * the snapshot, which is the order the real callbacks use — a `<Select>` that
   * got its value first would briefly have no option matching it.
   */
  menus?: Record<string, { value: string; label: string }[]>
  /**
   * When `false`, the server opens the socket but never replies to `hello` /
   * `snapshot-request` — used to exercise the handshake watchdog (Phase 3.2).
   * Defaults to `true`.
   */
  autoHandshake?: boolean
}

export interface MockTDHandle {
  /** Inject as `options.WebSocket` into `createTDConnection`. */
  WebSocket: typeof MockTDSocket & (new (url: string) => MockTDSocket)
  /** The socket the connection opened (available after construction). */
  socket: () => MockTDSocket
}

/**
 * Build a mock TD server that performs the standard handshake automatically:
 * `hello` → `welcome`, `snapshot-request` → `snapshot`. The returned
 * `WebSocket` is injected into `createTDConnection`; `socket()` exposes the live
 * socket for pushing `update`s or malformed frames mid-test.
 */
export function createMockTD(options: MockTDOptions = {}): MockTDHandle {
  const protocol = options.protocol ?? 1
  const snapshot = options.snapshot ?? {}
  const autoHandshake = options.autoHandshake ?? true
  let instance: MockTDSocket | undefined

  class WS extends MockTDSocket {
    constructor(url: string) {
      super(url)
      instance = this
      this.onClientMessage = (message) => {
        if (!autoHandshake) return
        if (message?.type === 'hello') {
          this.serverSend({
            type: 'welcome',
            protocol,
            ...(options.instance ? { instance: options.instance } : {}),
          })
        } else if (message?.type === 'snapshot-request') {
          if (options.menus) {
            this.serverSend({ type: 'menus', menus: options.menus })
          }
          this.serverSend({ type: 'snapshot', params: snapshot })
        } else if (message?.type === 'menus-request') {
          // Re-reads whatever `menus` currently holds, so a test can mutate the
          // handle's options to simulate hardware being plugged in or removed
          // and then assert on the reload.
          this.serverSend({ type: 'menus', menus: options.menus ?? {} })
        }
      }
    }
  }

  return {
    WebSocket: WS as typeof MockTDSocket & (new (url: string) => MockTDSocket),
    socket: () => {
      if (!instance) throw new Error('mock TD socket not yet constructed')
      return instance
    },
  }
}

/** Flush pending microtasks so queued socket open/handshake work runs. */
export async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
