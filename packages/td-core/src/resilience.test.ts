/**
 * Connection-resilience integration tests, driven against the mock TD
 * server with a manual scheduler so every timing path is deterministic:
 * reconnect + backoff (3.1), handshake watchdog (3.2), ping/pong heartbeat
 * (3.3), backpressure/congestion (3.5), disconnected-send drops + error routing
 * (3.6), and full teardown (3.7). The outbound throttle (3.4) is covered
 * through `<RangeInput>` in components/RangeInput.test.tsx.
 */

import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTDConnection } from './connection'
import { createMockTD, flush } from './testing/mockTD'
import { createManualScheduler } from './testing/scheduler'

// Silence the intentional debug/warn/error chatter these paths emit.
beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

function received(td: ReturnType<typeof createMockTD>) {
  return td.socket().received
}
function lastType(td: ReturnType<typeof createMockTD>): string | undefined {
  return (received(td).at(-1) as { type?: string } | undefined)?.type
}

describe('reconnect + backoff (3.1)', () => {
  it('reconnects and re-runs the full handshake after an unexpected drop', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { speed: 1 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      random: () => 0,
    })
    const speed = conn.signal('speed')
    await flush()
    expect(conn.status()).toBe('synced')
    expect(speed.value()).toBe(1)

    // Server drops the socket.
    td.socket().close()
    expect(conn.status()).toBe('connecting')

    // Backoff first delay: base = min(10000, 500) = 500, half-jitter with
    // random()=0 → 250ms. Advancing past it reconnects.
    sched.advance(250)
    await flush()
    expect(conn.status()).toBe('synced')

    // Fresh snapshot resyncs signals rather than leaving them stale.
    td.socket().serverSend({ type: 'update', params: { speed: 7 } })
    expect(speed.value()).toBe(7)
  })

  it('grows the backoff delay on repeated handshake failures, then caps', async () => {
    const sched = createManualScheduler()
    // Server opens the socket but never completes the handshake, so every
    // attempt trips the watchdog and schedules the next backoff step.
    const td = createMockTD({ autoHandshake: false })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      handshakeTimeout: 5_000,
      backoff: { min: 500, max: 4_000 },
      random: () => 0,
    })
    await flush()
    expect(conn.status()).toBe('open') // opened, awaiting welcome

    // Expected half-jitter delays (random()=0 → base/2): 250, 500, 1000, 2000,
    // then capped at max/2 = 2000.
    const expectedDelays = [250, 500, 1000, 2000, 2000]
    for (const delay of expectedDelays) {
      const failedSocket = td.socket()
      // Trip the watchdog for the current attempt.
      sched.advance(5_000)
      expect(conn.status()).toBe('connecting')
      // One tick short of the backoff delay: no new attempt yet.
      sched.advance(delay - 1)
      expect(td.socket()).toBe(failedSocket)
      // Cross the delay boundary → a fresh socket is opened.
      sched.advance(1)
      expect(td.socket()).not.toBe(failedSocket)
      await flush()
      expect(conn.status()).toBe('open')
      expect(lastType(td)).toBe('hello')
    }
  })

  it('does not reconnect when reconnect is disabled', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      reconnect: false,
    })
    await flush()
    td.socket().close()
    expect(conn.status()).toBe('connecting')
    expect(sched.pendingTimers()).toBe(0) // nothing scheduled
    sched.advance(60_000)
    expect(conn.status()).toBe('connecting') // never came back
  })
})

describe('handshake watchdog (3.2)', () => {
  it('abandons an attempt that never syncs and retries', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ autoHandshake: false })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      handshakeTimeout: 5_000,
      random: () => 0,
    })
    await flush()
    expect(conn.status()).toBe('open')

    // Just before the window closes: still trying.
    sched.advance(4_999)
    expect(conn.status()).toBe('open')
    // Window elapses → abandon into backoff.
    sched.advance(1)
    expect(conn.status()).toBe('connecting')
  })

  it('clears the watchdog the moment snapshot applies', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { a: 1 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      handshakeTimeout: 5_000,
      heartbeat: false, // isolate the watchdog from heartbeat-driven reconnects
    })
    await flush()
    expect(conn.status()).toBe('synced')
    // Advancing well past the window does not abandon a synced connection.
    sched.advance(60_000)
    expect(conn.status()).toBe('synced')
  })
})

describe('ping/pong heartbeat (3.3)', () => {
  it('sends a ping each interval and stays synced while pongs arrive', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      heartbeat: { interval: 5_000, timeout: 10_000 },
    })
    await flush()

    // Each interval pings; each pong keeps the session healthy across the
    // pong-timeout window (interval < timeout, so this exercises the overlap).
    sched.advance(5_000)
    expect(lastType(td)).toBe('ping')
    td.socket().serverSend({ type: 'pong' })

    sched.advance(5_000)
    expect(lastType(td)).toBe('ping')
    td.socket().serverSend({ type: 'pong' })

    expect(conn.status()).toBe('synced')
  })

  it('forces a reconnect when a pong is missed', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      heartbeat: { interval: 5_000, timeout: 10_000 },
      random: () => 0,
    })
    await flush()

    sched.advance(5_000) // ping sent, awaiting pong
    expect(lastType(td)).toBe('ping')
    sched.advance(10_000) // no pong → half-open → reconnect
    expect(conn.status()).toBe('connecting')

    sched.advance(250) // backoff, then reconnect
    await flush()
    expect(conn.status()).toBe('synced')
  })

  it('does not run a heartbeat when disabled', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      heartbeat: false,
    })
    await flush()
    sched.advance(60_000)
    expect(conn.status()).toBe('synced')
    expect(received(td).some((m: any) => m?.type === 'ping')).toBe(false)
  })
})

describe('backpressure / congestion (3.5)', () => {
  it('skips updates over the high-water mark and flips congested', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { level: 0 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      backpressure: { highWaterMark: 1_000, timeout: 5_000 },
    })
    const level = conn.signal('level')
    await flush()

    td.socket().bufferedAmount = 2_000 // TD stopped draining
    const before = received(td).length
    level.setValue(0.5)
    expect(received(td).length).toBe(before) // dropped
    expect(conn.congested()).toBe(true)
    expect(level.value()).toBe(0.5) // optimistic local write still lands

    // Buffer drains; the next send goes through and clears congestion.
    td.socket().bufferedAmount = 0
    level.setValue(0.6)
    expect(received(td).at(-1)).toEqual({ type: 'update', params: { level: 0.6 } })
    expect(conn.congested()).toBe(false)
  })

  it('forces a reconnect on sustained congestion', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { level: 0 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      backpressure: { highWaterMark: 1_000, timeout: 5_000 },
      random: () => 0,
    })
    const level = conn.signal('level')
    await flush()

    td.socket().bufferedAmount = 2_000
    level.setValue(0.5)
    expect(conn.congested()).toBe(true)

    sched.advance(5_000) // sustained high-water → forced reconnect
    expect(conn.status()).toBe('connecting')
    expect(conn.congested()).toBe(false) // reset on teardown
  })
})

describe('disconnected sends + errors (3.6)', () => {
  it('drops updates written while disconnected instead of queuing them', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { level: 0 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      reconnect: false,
    })
    const level = conn.signal('level')
    await flush()

    td.socket().close()
    level.setValue(0.5) // written while down
    expect(level.value()).toBe(0.5) // optimistic local write
    // Nothing queued: no update reached the (dead) socket.
    expect(received(td).some((m: any) => m?.type === 'update')).toBe(false)
  })

  it('routes inbound error messages to onError without tearing down', async () => {
    const sched = createManualScheduler()
    const errors: unknown[] = []
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      onError: (e) => errors.push(e),
    })
    await flush()

    td.socket().serverSend({
      type: 'error',
      code: 'param_not_writable',
      message: 'nope',
      ref: 'fps',
    })
    expect(errors).toEqual([
      { type: 'error', code: 'param_not_writable', message: 'nope', ref: 'fps' },
    ])
    expect(conn.lastError()).toEqual({
      type: 'error',
      code: 'param_not_writable',
      message: 'nope',
      ref: 'fps',
    })
    expect(conn.status()).toBe('synced') // non-fatal

    // Session still processes normal traffic afterward.
    const level = conn.signal('level')
    td.socket().serverSend({ type: 'update', params: { level: 3 } })
    expect(level.value()).toBe(3)
  })
})

describe('pulse (4.3)', () => {
  it('sends a pulse message immediately, uncoalesced by the throttle', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
    })
    await flush()

    conn.pulse('reset')
    // No frame flush needed — pulse is throttle-exempt.
    expect(received(td).at(-1)).toEqual({ type: 'pulse', name: 'reset' })

    conn.pulse('reset')
    conn.pulse('reset')
    expect(received(td).filter((m: any) => m?.type === 'pulse')).toHaveLength(3)
  })

  it('drops a pulse fired while disconnected', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      reconnect: false,
    })
    await flush()

    td.socket().close()
    const before = received(td).length
    conn.pulse('reset')
    expect(received(td).length).toBe(before)
  })

  it('drops a pulse while backpressured, same as an update', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: {} })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      backpressure: { highWaterMark: 1_000, timeout: 5_000 },
    })
    await flush()

    td.socket().bufferedAmount = 2_000
    const before = received(td).length
    conn.pulse('reset')
    expect(received(td).length).toBe(before)
    expect(conn.congested()).toBe(true)
  })
})

describe('read-only params (4.10)', () => {
  it('honors a statically-declared readonly set from construction', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { fps: 60 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      readonly: ['fps'],
    })
    await flush()

    expect(conn.isReadonly('fps')).toBe(true)
    expect(conn.isReadonly('level')).toBe(false)
  })

  it('marks a param read-only at runtime on param_not_writable and re-syncs it', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { fps: 60 } })
    const conn = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
    })
    const fps = conn.signal('fps')
    await flush()
    expect(conn.isReadonly('fps')).toBe(false)

    // Optimistic edit lands locally before TD rejects the write.
    fps.setValue(30)
    expect(fps.value()).toBe(30)
    expect(received(td).filter((m: any) => m?.type === 'update')).toHaveLength(1)

    td.socket().serverSend({
      type: 'error',
      code: 'param_not_writable',
      ref: 'fps',
    })
    expect(conn.isReadonly('fps')).toBe(true)
    // The runtime safety net re-requests a snapshot to revert the optimistic edit.
    expect(received(td).at(-1)).toEqual({ type: 'snapshot-request' })

    td.socket().serverSend({ type: 'snapshot', params: { fps: 60 } })
    expect(fps.value()).toBe(60) // reverted to TD's authoritative value
  })
})

describe('teardown (3.7)', () => {
  it('cancels every timer and closes the socket on dispose', async () => {
    const sched = createManualScheduler()
    const td = createMockTD({ snapshot: { level: 0 } })

    let conn!: ReturnType<typeof createTDConnection>
    const dispose = createRoot((d) => {
      conn = createTDConnection('ws://test', {
        WebSocket: td.WebSocket,
        scheduler: sched.scheduler,
        heartbeat: { interval: 5_000, timeout: 10_000 },
      })
      return d
    })
    await flush()
    expect(conn.status()).toBe('synced')
    // The heartbeat has armed a timer.
    expect(sched.pendingTimers()).toBeGreaterThan(0)
    const socket = td.socket()

    dispose()
    expect(conn.status()).toBe('closed')
    expect(socket.readyState).toBe(socket.CLOSED)
    // No timers survive teardown, so nothing can resurrect the connection.
    expect(sched.pendingTimers()).toBe(0)

    // A stray advance fires nothing and never reopens.
    sched.advance(60_000)
    expect(conn.status()).toBe('closed')
  })
})
