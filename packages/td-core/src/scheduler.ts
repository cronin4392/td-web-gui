/**
 * `TDScheduler` — the small slice of timer + animation-frame scheduling the
 * connection needs, stated as an injectable interface.
 *
 * The resilience features are all timing-driven — reconnect backoff, the
 * handshake watchdog, the ping/pong heartbeat, sustained-congestion detection,
 * and the rAF-aligned outbound throttle. Rather than reach for the globals
 * directly (which makes those paths untestable without real wall-clock delays),
 * the connection takes its clock through this interface. It defaults to the
 * real globals; tests inject a manual scheduler (see `testing/scheduler.ts`) to
 * drive time deterministically.
 *
 * Handles are opaque `number`s so the same shape covers browser `setTimeout` /
 * `requestAnimationFrame` return values and the manual scheduler's ids.
 */
export interface TDScheduler {
  setTimeout(callback: () => void, ms: number): number
  clearTimeout(handle: number): void
  /** Schedule a callback for the next animation frame (~60fps). */
  requestFrame(callback: () => void): number
  cancelFrame(handle: number): void
}

/**
 * Default scheduler backed by the platform globals. Uses
 * `requestAnimationFrame` when present (the browser and jsdom both provide it)
 * and falls back to a ~16ms timer for non-DOM hosts so `td-core` still works if
 * a connection is driven from, e.g., a worker without rAF.
 */
export const defaultScheduler: TDScheduler = {
  setTimeout: (callback, ms) => {
    const handle = globalThis.setTimeout(callback, ms)
    // In Node (the test host) a pending heartbeat timer would otherwise keep the
    // process alive; `unref` is a no-op-absent in browsers, so this is safe.
    ;(handle as { unref?: () => void })?.unref?.()
    return handle as unknown as number
  },
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  requestFrame: (callback) =>
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame(() => callback())
      : (globalThis.setTimeout(callback, 16) as unknown as number),
  cancelFrame: (handle) =>
    typeof globalThis.cancelAnimationFrame === 'function'
      ? globalThis.cancelAnimationFrame(handle)
      : globalThis.clearTimeout(handle),
}
