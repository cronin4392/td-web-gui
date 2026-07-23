/**
 * RangeInput behavior (Phase 2.4/2.5 + 3.4): optimistic send-on-change with
 * rAF-coalesced throttling by default, focus-driven echo suppression, and
 * TD-side reflection while idle. A slider's value is always a valid in-range
 * number, so there's no empty/NaN/clamp handling to test (cf. NumberInput).
 *
 * Sends are throttled by default, so tests drive a manual scheduler and
 * `flushFrame()` to observe the coalesced wire message.
 */

import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { createTDClient } from '../context'
import { createMockTD, flush } from '../testing/mockTD'
import { createManualScheduler } from '../testing/scheduler'

interface Params {
  level: number
}

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  host?.remove()
  host = undefined
})

async function setup(snapshot: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  const td = createMockTD({ snapshot })
  const sched = createManualScheduler()
  const TD = createTDClient<Params>()
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = render(
    () => (
      <TD.Provider
        url="ws://test"
        options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
      >
        <TD.RangeInput name="level" data-testid="range" min={0} max={1} step={0.01} {...attrs} />
      </TD.Provider>
    ),
    host,
  )
  await flush()
  const input = host.querySelector<HTMLInputElement>('[data-testid="range"]')!
  return { td, sched, input }
}

function drag(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function updates(td: ReturnType<typeof createMockTD>) {
  return td.socket().received.filter((m: any) => m?.type === 'update')
}

describe('RangeInput', () => {
  it('reflects the snapshot value on connect', async () => {
    const { input } = await setup({ level: 0.25 })
    expect(input.value).toBe('0.25')
  })

  it('coalesces rapid drags within a frame into one throttled update', async () => {
    const { td, sched, input } = await setup({ level: 0 })

    input.focus()
    drag(input, '0.5')
    drag(input, '0.75')
    // Optimistic local value moves immediately; nothing on the wire yet.
    expect(input.value).toBe('0.75')
    expect(updates(td)).toHaveLength(0)

    sched.flushFrame()
    // One message carrying only the latest value.
    expect(updates(td)).toEqual([{ type: 'update', params: { level: 0.75 } }])
  })

  it('sends on every change when throttle is disabled', async () => {
    const { td, input } = await setup({ level: 0 }, { throttle: false })

    input.focus()
    drag(input, '0.5')
    expect(td.socket().received.at(-1)).toEqual({ type: 'update', params: { level: 0.5 } })

    drag(input, '0.75')
    expect(td.socket().received.at(-1)).toEqual({ type: 'update', params: { level: 0.75 } })
  })

  it('suppresses TD echoes while focused', async () => {
    const { td, input } = await setup({ level: 0 })

    input.focus()
    drag(input, '0.5')
    // An inbound update for this param is ignored while the user is dragging.
    td.socket().serverSend({ type: 'update', params: { level: 0.1 } })
    expect(input.value).toBe('0.5')
  })

  it('reflects TD-side changes when not focused', async () => {
    const { td, input } = await setup({ level: 0.1 })
    expect(input.value).toBe('0.1')

    td.socket().serverSend({ type: 'update', params: { level: 0.9 } })
    expect(input.value).toBe('0.9')
  })
})
