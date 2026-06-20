/**
 * Integration test (Phase 2.6) — the full hello→welcome→snapshot→update flow
 * exercised end-to-end through the factory/provider/component layer against the
 * mock TD server, plus a malformed-message case and focus-based echo
 * suppression (Phase 2.5) observed through real DOM events.
 */

import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { createTDClient } from './context'
import { createMockTD, flush } from './testing/mockTD'

interface ExampleParams {
  message: string
  intensity: number
}

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  host?.remove()
  host = undefined
})

function mount(ui: () => any): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = render(ui, host)
  return host
}

describe('end-to-end through the provider', () => {
  it('round-trips a string and a number against the mock TD', async () => {
    const td = createMockTD({ snapshot: { message: 'hello', intensity: 0.5 } })
    const TD = createTDClient<ExampleParams>()

    const root = mount(() => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        <TD.TextInput name="message" data-testid="msg" />
        <TD.NumberInput name="intensity" min={0} max={1} step={0.01} data-testid="num" />
        <TD.Value name="intensity" format={(v) => Number(v).toFixed(2)} data-testid="readout" />
      </TD.Provider>
    ))

    await flush()

    const text = root.querySelector<HTMLInputElement>('[data-testid="msg"]')!
    const num = root.querySelector<HTMLInputElement>('[data-testid="num"]')!
    const readout = root.querySelector<HTMLSpanElement>('[data-testid="readout"]')!

    // Snapshot applied to the bound controls.
    expect(text.value).toBe('hello')
    expect(num.value).toBe('0.5')
    expect(readout.textContent).toBe('0.50')

    // Web → TD: edit the number, see the optimistic update sent on the wire.
    num.focus()
    num.value = '0.8'
    num.dispatchEvent(new Event('input', { bubbles: true }))
    expect(td.socket().received.at(-1)).toEqual({
      type: 'update',
      params: { intensity: 0.8 },
    })
    expect(readout.textContent).toBe('0.80')
    num.blur()

    // TD → web: a broadcast update reflects into both bound controls.
    td.socket().serverSend({ type: 'update', params: { intensity: 0.2 } })
    expect(num.value).toBe('0.2')
    expect(readout.textContent).toBe('0.20')
  })

  it('suppresses inbound echo while an input is focused, resumes on blur', async () => {
    const td = createMockTD({ snapshot: { message: 'start' } })
    const TD = createTDClient<ExampleParams>()

    const root = mount(() => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        <TD.TextInput name="message" data-testid="msg" />
      </TD.Provider>
    ))
    await flush()

    const text = root.querySelector<HTMLInputElement>('[data-testid="msg"]')!
    expect(text.value).toBe('start')

    // While focused, the local edit wins — TD's echo is ignored.
    text.focus()
    text.value = 'typed'
    text.dispatchEvent(new Event('input', { bubbles: true }))
    td.socket().serverSend({ type: 'update', params: { message: 'from-td' } })
    expect(text.value).toBe('typed')

    // After blur, live updates resume.
    text.blur()
    td.socket().serverSend({ type: 'update', params: { message: 'after-blur' } })
    expect(text.value).toBe('after-blur')
  })

  it('drops a malformed frame without breaking the session', async () => {
    const td = createMockTD({ snapshot: { intensity: 0.1 } })
    const TD = createTDClient<ExampleParams>()

    const root = mount(() => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        <TD.NumberInput name="intensity" data-testid="num" />
      </TD.Provider>
    ))
    await flush()

    const num = root.querySelector<HTMLInputElement>('[data-testid="num"]')!
    expect(num.value).toBe('0.1')

    td.socket().serverSendRaw('}{ broken')
    td.socket().serverSend({ type: 'update', params: { intensity: 0.9 } })
    expect(num.value).toBe('0.9')
  })
})
