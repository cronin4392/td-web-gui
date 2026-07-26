/**
 * Vector behavior: group of numeric inputs bound to a `number[]`
 * ParGroup, sends the whole array (throttled by default), hold-last-valid /
 * never-NaN / clamp per component like `<NumberInput>`, and editing any one
 * component suppresses TD echoes for the whole param (4.9's shared model
 * applied within a single binding).
 */

import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { createTDClient } from '../context'
import { createMockTD, flush } from '../testing/mockTD'
import { createManualScheduler } from '../testing/scheduler'

interface Params {
  position: number[]
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
        <TD.Vector name="position" labels={['x', 'y', 'z']} data-testid="vec" {...attrs} />
      </TD.Provider>
    ),
    host,
  )
  await flush()
  const inputs = Array.from(
    host.querySelectorAll<HTMLInputElement>('[data-testid="vec"] input'),
  )
  return { td, sched, inputs }
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function updates(td: ReturnType<typeof createMockTD>) {
  return td.socket().received.filter((m: any) => m?.type === 'update')
}

describe('Vector', () => {
  it('renders one input per label and reflects the snapshot', async () => {
    const { inputs } = await setup({ position: [1, 2, 3] })
    expect(inputs).toHaveLength(3)
    expect(inputs.map((i) => i.value)).toEqual(['1', '2', '3'])
  })

  it('edits one component and sends the whole array (throttled by default)', async () => {
    const { td, sched, inputs } = await setup({ position: [0, 0, 0] })

    inputs[1]!.focus()
    type(inputs[1]!, '5')
    expect(updates(td)).toHaveLength(0) // throttled — nothing yet

    sched.flushFrame()
    expect(updates(td)).toEqual([{ type: 'update', params: { position: [0, 5, 0] } }])
  })

  it('sends immediately when throttle is disabled', async () => {
    const { td, inputs } = await setup({ position: [0, 0, 0] }, { throttle: false })

    inputs[0]!.focus()
    type(inputs[0]!, '9')
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { position: [9, 0, 0] } })
  })

  it('holds last valid while empty/unparseable and never sends NaN', async () => {
    const { td, inputs } = await setup({ position: [1, 1, 1] }, { throttle: false })
    const before = updates(td).length

    inputs[0]!.focus()
    type(inputs[0]!, '')
    type(inputs[0]!, 'abc')
    expect(updates(td).length).toBe(before)
  })

  it('clamps to min/max before sending', async () => {
    const { td, inputs } = await setup(
      { position: [0, 0, 0] },
      { min: 0, max: 10, throttle: false },
    )

    inputs[0]!.focus()
    type(inputs[0]!, '999')
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { position: [10, 0, 0] } })
  })

  it('snaps back to the last valid value on blur', async () => {
    const { inputs } = await setup({ position: [4, 4, 4] })

    inputs[2]!.focus()
    type(inputs[2]!, '')
    inputs[2]!.blur()
    expect(inputs[2]!.value).toBe('4')
  })

  it('suppresses TD echoes for the whole param while any component is focused', async () => {
    const { td, sched, inputs } = await setup({ position: [0, 0, 0] })

    inputs[0]!.focus()
    type(inputs[0]!, '7')
    sched.flushFrame()

    td.socket().serverSend({ type: 'update', params: { position: [1, 2, 3] } })
    expect(inputs.map((i) => i.value)).toEqual(['7', '0', '0'])
  })

  it('reflects TD-side changes when idle', async () => {
    const { td, inputs } = await setup({ position: [0, 0, 0] })

    td.socket().serverSend({ type: 'update', params: { position: [1, 2, 3] } })
    expect(inputs.map((i) => i.value)).toEqual(['1', '2', '3'])
  })

  it('disables when bound to a read-only param', async () => {
    const td = createMockTD({ snapshot: { position: [0, 0, 0] } })
    const TD = createTDClient<Params>()
    host = document.createElement('div')
    document.body.appendChild(host)
    dispose = render(
      () => (
        <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }} readonly={['position']}>
          <TD.Vector name="position" labels={['x', 'y', 'z']} data-testid="vec" />
        </TD.Provider>
      ),
      host,
    )
    await flush()
    const inputs = Array.from(
      host.querySelectorAll<HTMLInputElement>('[data-testid="vec"] input'),
    )
    expect(inputs.every((i) => i.disabled)).toBe(true)
  })
})
