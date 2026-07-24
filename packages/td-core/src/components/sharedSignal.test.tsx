/**
 * Multiple components bound to the same param name (Phase 4.9) — verifies the
 * shared-signal model already implied by lazy allocation (2.2) and
 * focus-based echo suppression (2.5): every binder of a name shares one
 * signal and one active-editor count, so an optimistic write from any one of
 * them fans out to all the others, and suppression is a *count*, not a
 * boolean, so overlapping editors don't unsuppress each other prematurely.
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

function drag(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('shared signal across multiple binders (4.9)', () => {
  it('fans an optimistic write from a slider out to a readout of the same param', async () => {
    const td = createMockTD({ snapshot: { level: 0 } })
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
          <TD.RangeInput name="level" data-testid="range" min={0} max={1} step={0.01} />
          <TD.Value name="level" data-testid="readout" />
        </TD.Provider>
      ),
      host,
    )
    await flush()
    const range = host.querySelector<HTMLInputElement>('[data-testid="range"]')!
    const readout = host.querySelector<HTMLSpanElement>('[data-testid="readout"]')!
    expect(readout.textContent).toBe('0')

    range.focus()
    drag(range, '0.5')
    // The readout updates immediately from the shared signal — no wire round
    // trip needed, and independent of the range's own throttled send.
    expect(readout.textContent).toBe('0.5')
    expect(td.socket().received.filter((m: any) => m?.type === 'update')).toHaveLength(0)

    // While the range is focused/dragging, an inbound TD echo for this name is
    // suppressed — for *every* binder sharing the entry, not just the range.
    td.socket().serverSend({ type: 'update', params: { level: 0.9 } })
    expect(range.value).toBe('0.5')
    expect(readout.textContent).toBe('0.5')

    range.blur()
    td.socket().serverSend({ type: 'update', params: { level: 0.9 } })
    expect(range.value).toBe('0.9')
    expect(readout.textContent).toBe('0.9')
  })

  it('fans an edit from a number input out to a slider bound to the same param', async () => {
    const td = createMockTD({ snapshot: { level: 0 } })
    const TD = createTDClient<Params>()
    host = document.createElement('div')
    document.body.appendChild(host)
    dispose = render(
      () => (
        <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
          <TD.RangeInput name="level" data-testid="range" min={0} max={1} step={0.01} />
          <TD.NumberInput name="level" data-testid="num" />
        </TD.Provider>
      ),
      host,
    )
    await flush()
    const range = host.querySelector<HTMLInputElement>('[data-testid="range"]')!
    const num = host.querySelector<HTMLInputElement>('[data-testid="num"]')!

    num.focus()
    num.value = '0.75'
    num.dispatchEvent(new Event('input', { bubbles: true }))
    expect(range.value).toBe('0.75')

    num.blur()
    range.focus()
    drag(range, '0.2')
    expect(num.value).toBe('0.2')
  })

  it('tracks the editor count, not a boolean, so overlapping editors do not unsuppress each other early', async () => {
    const td = createMockTD({ snapshot: { level: 0 } })
    const TD = createTDClient<Params>()
    host = document.createElement('div')
    document.body.appendChild(host)
    dispose = render(
      () => (
        <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
          <TD.RangeInput name="level" data-testid="range" min={0} max={1} step={0.01} />
          <TD.NumberInput name="level" data-testid="num" />
        </TD.Provider>
      ),
      host,
    )
    await flush()
    const range = host.querySelector<HTMLInputElement>('[data-testid="range"]')!
    const num = host.querySelector<HTMLInputElement>('[data-testid="num"]')!

    // Dispatch focus directly (bypassing jsdom's native single-active-element
    // handling) so both binders' editor counts accumulate, simulating two
    // overlapping editors on the one shared param.
    range.dispatchEvent(new Event('focus'))
    num.dispatchEvent(new Event('focus'))

    // Count is 2: an inbound echo is still suppressed.
    td.socket().serverSend({ type: 'update', params: { level: 0.4 } })
    expect(range.value).toBe('0')

    // Releasing just one editor (count → 1) must not lift suppression yet.
    range.dispatchEvent(new Event('blur'))
    td.socket().serverSend({ type: 'update', params: { level: 0.6 } })
    expect(range.value).toBe('0')

    // Releasing the last editor (count → 0) finally lifts it.
    num.dispatchEvent(new Event('blur'))
    td.socket().serverSend({ type: 'update', params: { level: 0.8 } })
    expect(range.value).toBe('0.8')
  })
})
