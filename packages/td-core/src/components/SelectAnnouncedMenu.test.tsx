/**
 * TD-announced menu options (Phase 6.2) — the `menus` message and `<Select>`
 * without an `options` prop.
 *
 * The motivating case is an audio-device list: its keys are machine-specific
 * device GUIDs and the list changes when hardware is plugged in, so it cannot
 * be authored on the web side at all. These tests use realistic TD device keys
 * rather than tidy ones, because the ugliness *is* the requirement — a test
 * with `{ value: 'a' }` would pass just as well against a design that couldn't
 * carry a real device id.
 */

import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { createTDClient } from '../context'
import { createMockTD, flush } from '../testing/mockTD'

interface Params {
  audiodevice: string
  blendmode: string
}

const DEFAULT_KEY = 'default'
const VOICEMEETER_KEY =
  '{0.0.1.00000000}.{feb5e51a-d9cd-45c0-8aff-4770ba283ba0}||Voicemeeter_Out_A4_(VB-Audio_Voicemeeter_VAIO)||1'
const WEBCAM_KEY =
  '{0.0.1.00000000}.{084bc786-4c46-4010-b309-b57b92db9650}||Webcam_1_(NDI_Webcam_Audio)||2'

const deviceMenu = [
  { value: DEFAULT_KEY, label: 'default' },
  { value: VOICEMEETER_KEY, label: 'Voicemeeter Out A4 (VB-Audio Voicemeeter VAIO)' },
  { value: WEBCAM_KEY, label: 'Webcam 1 (NDI Webcam Audio)' },
]

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  host?.remove()
  host = undefined
})

async function setup(
  options: Parameters<typeof createMockTD>[0],
  children: (TD: ReturnType<typeof createTDClient<Params>>) => unknown,
) {
  const td = createMockTD(options)
  const TD = createTDClient<Params>()
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        {children(TD) as never}
      </TD.Provider>
    ),
    host,
  )
  await flush()
  return { td, select: () => host!.querySelector<HTMLSelectElement>('[data-testid="sel"]')! }
}

describe('TD-announced menus', () => {
  it('builds the dropdown from TD’s announcement when no options prop is given', async () => {
    const { select } = await setup(
      { snapshot: { audiodevice: VOICEMEETER_KEY }, menus: { audiodevice: deviceMenu } },
      (TD) => <TD.Select name="audiodevice" data-testid="sel" />,
    )

    expect(Array.from(select().options).map((o) => ({ value: o.value, label: o.label }))).toEqual(
      deviceMenu,
    )
  })

  it('selects the snapshot value against an announced key', async () => {
    const { select } = await setup(
      { snapshot: { audiodevice: VOICEMEETER_KEY }, menus: { audiodevice: deviceMenu } },
      (TD) => <TD.Select name="audiodevice" data-testid="sel" />,
    )

    expect(select().value).toBe(VOICEMEETER_KEY)
  })

  it('sends the full device key back on change, not the label', async () => {
    const { td, select } = await setup(
      { snapshot: { audiodevice: DEFAULT_KEY }, menus: { audiodevice: deviceMenu } },
      (TD) => <TD.Select name="audiodevice" data-testid="sel" />,
    )

    select().value = WEBCAM_KEY
    select().dispatchEvent(new Event('change', { bubbles: true }))

    expect(td.socket().received.at(-1)).toEqual({
      type: 'update',
      params: { audiodevice: WEBCAM_KEY },
    })
  })

  it('re-announcing replaces the list, so an unplugged device disappears', async () => {
    const { td, select } = await setup(
      { snapshot: { audiodevice: DEFAULT_KEY }, menus: { audiodevice: deviceMenu } },
      (TD) => <TD.Select name="audiodevice" data-testid="sel" />,
    )
    expect(select().options.length).toBe(3)

    // The webcam is unplugged; TD re-announces without it. A merge would leave
    // it selectable forever, which is the bug this replacement prevents.
    td.socket().serverSend({
      type: 'menus',
      menus: { audiodevice: deviceMenu.filter((o) => o.value !== WEBCAM_KEY) },
    })

    const values = Array.from(select().options).map((o) => o.value)
    expect(values).toEqual([DEFAULT_KEY, VOICEMEETER_KEY])
  })

  it('keeps a value TD reports that is no longer in the menu visible, and disabled', async () => {
    // The device was selected in TD and then unplugged. <select> would otherwise
    // silently fall back to displaying the first option, which misreports TD's
    // actual state as though the user had picked "default".
    const { td, select } = await setup(
      { snapshot: { audiodevice: WEBCAM_KEY }, menus: { audiodevice: deviceMenu } },
      (TD) => <TD.Select name="audiodevice" data-testid="sel" />,
    )

    td.socket().serverSend({
      type: 'menus',
      menus: { audiodevice: deviceMenu.filter((o) => o.value !== WEBCAM_KEY) },
    })

    expect(select().value).toBe(WEBCAM_KEY)
    const orphan = Array.from(select().options).find((o) => o.value === WEBCAM_KEY)!
    expect(orphan.disabled).toBe(true)
  })

  it('a web-authored options prop still wins over an announcement', async () => {
    // Announcing must never change what an existing <Select options={...}>
    // renders, or adding announcements to a project would be a breaking change.
    const authored = [
      { value: 'add', label: 'Add' },
      { value: 'over', label: 'Over' },
    ]
    const { select } = await setup(
      {
        snapshot: { blendmode: 'over' },
        menus: { blendmode: [{ value: 'multiply', label: 'Multiply (from TD)' }] },
      },
      (TD) => <TD.Select name="blendmode" options={authored} data-testid="sel" />,
    )

    expect(Array.from(select().options).map((o) => o.value)).toEqual(['add', 'over'])
  })

  it('requestMenus() asks TD to re-read, and the reply refreshes the dropdown', async () => {
    // The reload-button path. `menus` is mutated between the initial announce
    // and the request to stand in for hardware appearing — which is exactly the
    // event TD cannot notify us about.
    const menus: Record<string, { value: string; label: string }[]> = {
      audiodevice: deviceMenu.slice(0, 2),
    }
    const td = createMockTD({ snapshot: { audiodevice: DEFAULT_KEY }, menus })
    const TD = createTDClient<Params>()
    host = document.createElement('div')
    document.body.appendChild(host)

    let conn!: ReturnType<typeof TD.useConnection>
    function Probe() {
      conn = TD.useConnection()
      return <TD.Select name="audiodevice" data-testid="sel" />
    }
    dispose = render(
      () => (
        <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
          <Probe />
        </TD.Provider>
      ),
      host,
    )
    await flush()
    const select = () => host!.querySelector<HTMLSelectElement>('[data-testid="sel"]')!
    expect(select().options.length).toBe(2)

    menus.audiodevice = deviceMenu // the webcam is now plugged in
    conn.requestMenus()
    await flush()

    expect(td.socket().received.some((m: any) => m?.type === 'menus-request')).toBe(true)
    expect(Array.from(select().options).map((o) => o.value)).toEqual(deviceMenu.map((o) => o.value))
  })

  it('renders an empty dropdown rather than throwing when nothing is announced', async () => {
    const { select } = await setup({ snapshot: { audiodevice: '' } }, (TD) => (
      <TD.Select name="audiodevice" data-testid="sel" />
    ))

    expect(select().options.length).toBe(0)
  })
})
