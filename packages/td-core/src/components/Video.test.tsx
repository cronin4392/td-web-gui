/**
 * `<Video>` behavior (Phase 5.4): stream selection through the provider's peer,
 * the `muted autoplay playsinline` defaults with prop passthrough, and several
 * tiles on one stream id sharing a single decoded `MediaStream`.
 */

import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTDClient } from '../context'
import { createMockTD } from '../testing/mockTD'
import {
  MockMediaStreamCtor,
  MockPeerConnection,
  MockRTCPeerConnection,
  trackOf,
} from '../testing/mockRTC'
import { createManualScheduler } from '../testing/scheduler'

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

beforeEach(() => {
  MockPeerConnection.reset()
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  host?.remove()
  host = undefined
  vi.restoreAllMocks()
})

async function settle(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve()
}

interface Params {
  level: number
}

async function mount(ui: (TD: ReturnType<typeof createTDClient<Params>>) => any) {
  const td = createMockTD({ snapshot: {} })
  const sched = createManualScheduler()
  const TD = createTDClient<Params>()
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = render(
    () => (
      <TD.Provider
        url="ws://test"
        options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
        video={{
          RTCPeerConnection: MockRTCPeerConnection,
          MediaStream: MockMediaStreamCtor,
          scheduler: sched.scheduler,
          receivers: 2,
        }}
      >
        {ui(TD)}
      </TD.Provider>
    ),
    host,
  )
  await settle()
  return { td, TD, host: host! }
}

function videoAt(index = 0): HTMLVideoElement {
  const el = host!.querySelectorAll('video')[index]
  if (!el) throw new Error(`no <video> at index ${index}`)
  return el
}

describe('<Video>', () => {
  it('renders muted/autoplay/playsinline and passes props through', async () => {
    await mount((TD) => <TD.Video class="tile" data-testid="v" />)
    const el = videoAt()

    expect(el.autoplay).toBe(true)
    expect(el.hasAttribute('playsinline')).toBe(true)
    // Asserted as a property, not an attribute — the attribute alone wouldn't
    // actually mute a dynamically created element, and an unmuted <video> can't
    // autoplay.
    expect(el.muted).toBe(true)
    expect(el.getAttribute('class')).toBe('tile')
    expect(el.getAttribute('data-testid')).toBe('v')
  })

  it('lets a caller unmute', async () => {
    await mount((TD) => <TD.Video muted={false} />)
    expect(videoAt().muted).toBe(false)
  })

  it('binds the selected stream and rebinds when its mid shifts', async () => {
    const { td } = await mount((TD) => <TD.Video stream="preview" />)
    const peer = MockPeerConnection.latest()
    peer.emitTrack('0')
    const preview = peer.emitTrack('1')

    td.socket().serverSend({
      type: 'streams',
      streams: [
        { id: 'main', mid: '0' },
        { id: 'preview', mid: '1' },
      ],
    })
    await settle()
    expect(trackOf(videoAt().srcObject as never)).toBe(preview)

    // A renegotiation moved `preview` onto mid 0 — the element follows the map.
    td.socket().serverSend({ type: 'streams', streams: [{ id: 'preview', mid: '0' }] })
    await settle()
    expect(trackOf(videoAt().srcObject as never)).not.toBe(preview)
  })

  it('defaults to the primary stream when no id is given', async () => {
    const { td } = await mount((TD) => <TD.Video />)
    const main = MockPeerConnection.latest().emitTrack('0')

    td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '0' }] })
    await settle()
    expect(trackOf(videoAt().srcObject as never)).toBe(main)
  })

  it('shares one decoded MediaStream across several tiles on the same id', async () => {
    const { td } = await mount((TD) => (
      <>
        <TD.Video stream="main" />
        <TD.Video stream="main" />
      </>
    ))
    const main = MockPeerConnection.latest().emitTrack('0')

    td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '0' }] })
    await settle()

    expect(trackOf(videoAt(0).srcObject as never)).toBe(main)
    expect(videoAt(1).srcObject).toBe(videoAt(0).srcObject)
  })

  it('holds no source until the track arrives', async () => {
    await mount((TD) => <TD.Video stream="main" />)
    expect(videoAt().srcObject).toBeNull()
  })

  it('throws when the provider did not enable video', () => {
    const td = createMockTD({ snapshot: {} })
    const TD = createTDClient<Params>()
    host = document.createElement('div')
    document.body.appendChild(host)

    expect(() => {
      dispose = render(
        () => (
          <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
            <TD.Video />
          </TD.Provider>
        ),
        host!,
      )
    }).toThrow(/no TD video peer in context/)
  })
})
