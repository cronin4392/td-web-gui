/**
 * `<StreamToggle>` behavior: reflecting TD's announced stream state, sending
 * `stream-enable` on click, staying disabled until TD has said, and detaching a
 * `<Video>` on the same id so an off stream doesn't show a frozen frame.
 */

import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, type MockTDHandle } from '../testing/mockTD';
import { MockMediaStreamCtor, MockPeerConnection, MockRTCPeerConnection } from '../testing/mockRTC';
import { createManualScheduler } from '../testing/scheduler';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  MockPeerConnection.reset();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
  vi.restoreAllMocks();
});

async function settle(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

interface Params {
  level: number;
}

async function mount(ui: (TD: ReturnType<typeof createTDClient<Params>>) => any) {
  const td = createMockTD({ snapshot: {} });
  const sched = createManualScheduler();
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
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
  );
  await settle();
  return { td, TD, host: host! };
}

/** Announce two tracks and their on/off state, as a connected TD would. */
async function announce(td: MockTDHandle, state: Record<string, boolean>) {
  const peer = MockPeerConnection.latest();
  peer.emitTrack('0');
  peer.emitTrack('1');
  td.socket().serverSend({
    type: 'streams',
    streams: [
      { id: 'tile1', mid: '0' },
      { id: 'tile2', mid: '1' },
    ],
  });
  td.socket().serverSend({ type: 'stream-state', streams: state });
  await settle();
}

function boxAt(index = 0): HTMLInputElement {
  const el = host!.querySelectorAll('input[type=checkbox]')[index];
  if (!el) throw new Error(`no checkbox at index ${index}`);
  return el as HTMLInputElement;
}

describe('<StreamToggle>', () => {
  it('stays disabled until TD announces a state for the stream', async () => {
    await mount((TD) => <TD.StreamToggle stream="tile1" />);
    // "TD hasn't said" is not "off": an id with no generated encoder must never
    // become clickable, or the click sends into nothing.
    expect(boxAt().disabled).toBe(true);
    expect(boxAt().checked).toBe(false);
  });

  it('reflects the announced state and follows TD-side changes', async () => {
    const { td } = await mount((TD) => <TD.StreamToggle stream="tile1" />);
    await announce(td, { tile1: true, tile2: true });

    expect(boxAt().disabled).toBe(false);
    expect(boxAt().checked).toBe(true);

    // Someone switched it off in TD's parameter dialog.
    td.socket().serverSend({ type: 'stream-state', streams: { tile1: false, tile2: true } });
    await settle();
    expect(boxAt().checked).toBe(false);
  });

  it('sends stream-enable on click and applies it optimistically', async () => {
    const { td } = await mount((TD) => <TD.StreamToggle stream="tile1" />);
    await announce(td, { tile1: true, tile2: true });

    boxAt().click();
    await settle();

    expect(td.socket().received.at(-1)).toEqual({
      type: 'stream-enable',
      id: 'tile1',
      enabled: false,
    });
    expect(boxAt().checked).toBe(false);
  });

  it('defaults to the primary stream when no id is given', async () => {
    const { td } = await mount((TD) => <TD.StreamToggle />);
    await announce(td, { tile1: true, tile2: true });

    boxAt().click();
    await settle();
    expect(td.socket().received.at(-1)).toEqual({
      type: 'stream-enable',
      id: 'tile1',
      enabled: false,
    });
  });

  it('passes props through and honours an explicit disabled', async () => {
    const { td } = await mount((TD) => (
      <TD.StreamToggle stream="tile1" disabled class="x" data-testid="t" />
    ));
    await announce(td, { tile1: true, tile2: true });

    expect(boxAt().disabled).toBe(true);
    expect(boxAt().getAttribute('class')).toBe('x');
    expect(boxAt().getAttribute('data-testid')).toBe('t');
  });

  it('detaches the <Video> on the same id, so off does not show a frozen frame', async () => {
    const { td } = await mount((TD) => (
      <>
        <TD.Video stream="tile1" />
        <TD.StreamToggle stream="tile1" />
      </>
    ));
    await announce(td, { tile1: true, tile2: true });
    const video = host!.querySelector('video')!;
    expect(video.srcObject).not.toBeNull();

    boxAt().click();
    await settle();

    // The track stays live and silent when TD stops encoding, so the element
    // would otherwise hold its last decoded frame and read as running video.
    expect(video.srcObject).toBeNull();

    // And comes back without a renegotiation — same peer, same track.
    td.socket().serverSend({ type: 'stream-state', streams: { tile1: true, tile2: true } });
    await settle();
    expect(video.srcObject).not.toBeNull();
    expect(MockPeerConnection.instances).toHaveLength(1);
  });

  it('throws when the provider did not enable video', () => {
    const td = createMockTD({ snapshot: {} });
    const TD = createTDClient<Params>();
    host = document.createElement('div');
    document.body.appendChild(host);

    expect(() => {
      dispose = render(
        () => (
          <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
            <TD.StreamToggle stream="tile1" />
          </TD.Provider>
        ),
        host!,
      );
    }).toThrow(/no TD video peer in context/);
  });
});
