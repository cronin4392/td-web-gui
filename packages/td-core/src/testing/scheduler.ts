/**
 * Manual scheduler for tests — a deterministic {@link TDScheduler} whose virtual
 * clock and animation frames are advanced by the test, so the timing paths
 * (backoff, watchdog, heartbeat, congestion, throttle) run without real delays.
 *
 * `advance(ms)` fires every timer due within the window in chronological order,
 * re-evaluating after each callback so a self-rearming timer (the heartbeat)
 * that schedules its next tick beyond the window is left pending rather than
 * spinning. `flushFrame()` runs the frame callbacks queued so far; a frame
 * callback that requests another frame is deferred to the next `flushFrame`,
 * matching real `requestAnimationFrame` semantics.
 */

import type { TDScheduler } from '../scheduler'

interface Timer {
  id: number
  at: number
  callback: () => void
}

export interface ManualScheduler {
  /** Inject as `options.scheduler` into `createTDConnection`. */
  scheduler: TDScheduler
  /** Advance virtual time by `ms`, firing due timers in order. */
  advance(ms: number): void
  /** Run the animation-frame callbacks queued so far (once each). */
  flushFrame(): void
  /** Current virtual time in ms. */
  now(): number
  /** Count of still-pending timers (excludes frame callbacks). */
  pendingTimers(): number
  /** Count of still-pending frame callbacks. */
  pendingFrames(): number
}

export function createManualScheduler(): ManualScheduler {
  let time = 0
  let nextId = 1
  let timers: Timer[] = []
  let frames: { id: number; callback: () => void }[] = []

  const scheduler: TDScheduler = {
    setTimeout(callback, ms) {
      const id = nextId++
      timers.push({ id, at: time + Math.max(0, ms), callback })
      return id
    },
    clearTimeout(handle) {
      timers = timers.filter((t) => t.id !== handle)
    },
    requestFrame(callback) {
      const id = nextId++
      frames.push({ id, callback })
      return id
    },
    cancelFrame(handle) {
      frames = frames.filter((f) => f.id !== handle)
    },
  }

  function advance(ms: number): void {
    const target = time + ms
    // Fire the earliest due timer, then re-scan — a callback may add or clear
    // timers (the heartbeat re-arms itself), and only those still due by `target`
    // should fire this call.
    for (;;) {
      let next: Timer | undefined
      for (const t of timers) {
        if (t.at > target) continue
        if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t
      }
      if (!next) break
      timers = timers.filter((t) => t.id !== next!.id)
      time = next.at
      next.callback()
    }
    time = target
  }

  function flushFrame(): void {
    const batch = frames
    frames = []
    for (const f of batch) f.callback()
  }

  return {
    scheduler,
    advance,
    flushFrame,
    now: () => time,
    pendingTimers: () => timers.length,
    pendingFrames: () => frames.length,
  }
}
