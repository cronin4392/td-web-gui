/**
 * `commitOn` behavior (TEXT_SELECTOR.md §6): nothing sent while typing, commit
 * on form submit, commit on blur, Escape reverts silently, no-op on unchanged
 * value, `commitOn="input"` unregressed.
 */

import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { createTDClient } from '../context'
import { createMockTD, flush } from '../testing/mockTD'

interface Params {
  text1: string
}

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  host?.remove()
  host = undefined
})

interface SetupOptions {
  commitOn?: 'input' | 'enter'
  wrapInForm?: boolean
  onCommit?: (v: string) => void
}

async function setup(snapshot: Record<string, unknown>, opts: SetupOptions = {}) {
  const td = createMockTD({ snapshot })
  const TD = createTDClient<Params>()
  host = document.createElement('div')
  document.body.appendChild(host)

  const input = () => (
    <TD.TextInput name="text1" commitOn={opts.commitOn ?? 'enter'} data-testid="txt" onCommit={opts.onCommit} />
  )

  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        {opts.wrapInForm === false ? input() : <form data-testid="form">{input()}</form>}
      </TD.Provider>
    ),
    host,
  )
  await flush()
  const el = host.querySelector<HTMLInputElement>('[data-testid="txt"]')!
  return { td, input: el }
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function updatesSent(td: ReturnType<typeof createMockTD>) {
  return td.socket().received.filter((m: any) => m?.type === 'update')
}

describe('TextInput commitOn="enter"', () => {
  it('sends nothing while typing', async () => {
    const { td, input } = await setup({ text1: 'hello' })
    input.focus()
    type(input, 'hel')
    type(input, 'hell')
    type(input, 'hello world')
    expect(updatesSent(td)).toHaveLength(0)
    expect(input.value).toBe('hello world')
  })

  it('commits on native form submission', async () => {
    const onCommit: string[] = []
    const { td, input } = await setup({ text1: 'hello' }, { onCommit: (v) => onCommit.push(v) })
    input.focus()
    type(input, 'cue two')

    const form = host!.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    expect(updatesSent(td)).toEqual([{ type: 'update', params: { text1: 'cue two' } }])
    expect(onCommit).toEqual(['cue two'])
  })

  it('falls back to Enter keydown when there is no ancestor form', async () => {
    const { td, input } = await setup({ text1: 'hello' }, { wrapInForm: false })
    input.focus()
    type(input, 'no form here')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    expect(updatesSent(td)).toEqual([{ type: 'update', params: { text1: 'no form here' } }])
  })

  it('ignores Enter fallback while composing (IME)', async () => {
    const { td, input } = await setup({ text1: 'hello' }, { wrapInForm: false })
    input.focus()
    type(input, 'draft')
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }),
    )

    expect(updatesSent(td)).toHaveLength(0)
  })

  it('commits on blur', async () => {
    const { td, input } = await setup({ text1: 'hello' })
    input.focus()
    type(input, 'intermission')
    input.blur()

    expect(updatesSent(td)).toEqual([{ type: 'update', params: { text1: 'intermission' } }])
  })

  it('Escape reverts the draft and sends nothing, and a following blur does not re-commit', async () => {
    const { td, input } = await setup({ text1: 'hello' })
    input.focus()
    type(input, 'oops')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

    expect(input.value).toBe('hello')
    input.blur()

    expect(updatesSent(td)).toHaveLength(0)
  })

  it('a commit equal to the last committed value is a no-op', async () => {
    const { td, input } = await setup({ text1: 'hello' })
    input.focus()
    type(input, 'hello')
    input.blur()

    expect(updatesSent(td)).toHaveLength(0)
  })

  it('reflects TD-side changes while not focused', async () => {
    const { td, input } = await setup({ text1: 'hello' })
    expect(input.value).toBe('hello')

    td.socket().serverSend({ type: 'update', params: { text1: 'from td' } })
    expect(input.value).toBe('from td')
  })
})

describe('TextInput commitOn="input" (unregressed)', () => {
  it('sends on every keystroke', async () => {
    const { td, input } = await setup({ text1: '' }, { commitOn: 'input' })

    input.focus()
    type(input, 'h')
    type(input, 'hi')

    expect(updatesSent(td)).toEqual([
      { type: 'update', params: { text1: 'h' } },
      { type: 'update', params: { text1: 'hi' } },
    ])
  })
})
