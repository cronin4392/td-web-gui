/**
 * Regressions for four defects that all shared one shape: a lifecycle opened in
 * one place and closed in another, with no owner tying the two together.
 */

import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';
import { createTDConnection } from './connection';
import { createTDClient } from './context';
import { createMockTD, flush, MockTDSocket } from './testing/mockTD';
import { createManualScheduler } from './testing/scheduler';

interface Params {
  bang: boolean;
  level: number;
}

describe('regressions', () => {
  it('1a: unmounting a focused control releases the edit lock', async () => {
    const td = createMockTD({ snapshot: { level: 1 } });
    const TD = createTDClient<Params>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    let connection!: ReturnType<typeof TD.useConnection>;
    const [show, setShow] = createSignal(true);
    render(
      () => (
        <TD.Provider url="ws://t" options={{ WebSocket: td.WebSocket }}>
          {(() => {
            connection = TD.useConnection();
            return null;
          })()}
          {show() ? <TD.RangeInput name="level" data-testid="r" /> : null}
        </TD.Provider>
      ),
      host,
    );
    await flush();
    const input = host.querySelector<HTMLInputElement>('[data-testid="r"]')!;
    input.focus();
    input.value = '5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    setShow(false); // unmounted while focused — no blur fires
    await flush();

    td.socket().serverSend({ type: 'update', params: { level: 99 } });
    await flush();
    expect(connection.signal('level').value()).toBe(99);
  });

  it('1b: <Button mode="pulse" disabled> renders disabled and sends nothing', async () => {
    const td = createMockTD({ snapshot: {} });
    const TD = createTDClient<Params>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(
      () => (
        <TD.Provider url="ws://t" options={{ WebSocket: td.WebSocket }}>
          <TD.Button name="bang" disabled data-testid="b" />
        </TD.Provider>
      ),
      host,
    );
    await flush();
    const btn = host.querySelector<HTMLButtonElement>('[data-testid="b"]')!;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(td.socket().received.some((m: any) => m?.type === 'pulse')).toBe(false);
  });

  it('1b: a pulse button forwards handlers its mode does not intercept', async () => {
    const td = createMockTD({ snapshot: {} });
    const TD = createTDClient<Params>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    let seen = 0;
    render(
      () => (
        <TD.Provider url="ws://t" options={{ WebSocket: td.WebSocket }}>
          <TD.Button name="bang" onPointerDown={() => seen++} data-testid="b" />
        </TD.Provider>
      ),
      host,
    );
    await flush();
    host
      .querySelector<HTMLButtonElement>('[data-testid="b"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(seen).toBe(1);
  });

  it('1c: a synchronously-answered call resolves instead of hanging', async () => {
    class SyncWS extends MockTDSocket {
      constructor(url: string) {
        super(url);
        this.onClientMessage = (m: any) => {
          if (m?.type === 'hello') this.serverSend({ type: 'welcome', protocol: 1 });
          else if (m?.type === 'snapshot-request')
            this.serverSend({ type: 'snapshot', params: {} });
          else if (m?.type === 'call' && m.id)
            this.serverSend({ type: 'result', id: m.id, value: 'pong' });
        };
      }
    }
    const manual = createManualScheduler();
    const connection = createTDConnection('ws://t', {
      WebSocket: SyncWS as unknown as typeof MockTDSocket & (new (url: string) => MockTDSocket),
      scheduler: manual.scheduler,
    });
    await flush();
    const before = manual.pendingTimers();
    await expect(connection.call('ping')).resolves.toBe('pong');
    expect(manual.pendingTimers()).toBe(before); // the call's timeout was cleared
  });

  it('1d: renegotiating a mid stops the media it replaces', async () => {
    const stopped: string[] = [];
    const makeTrack = (id: string) => ({ id, stop: () => stopped.push(id) });

    class FakeMedia {
      readonly id: string;
      constructor(private tracks: { id: string; stop(): void }[]) {
        this.id = tracks[0]!.id;
      }
      getTracks() {
        return this.tracks;
      }
    }

    const td = createMockTD({ snapshot: {} });
    const connection = createTDConnection('ws://t', { WebSocket: td.WebSocket });
    await flush();

    const { createTDVideoStream } = await import('./video');
    let peer: any;
    class FakePC {
      onicecandidate = null;
      ontrack: ((e: any) => void) | null = null;
      onnegotiationneeded = null;
      onconnectionstatechange = null;
      oniceconnectionstatechange = null;
      connectionState = 'new';
      signalingState = 'stable';
      localDescription = null;
      constructor() {
        peer = this;
      }
      addTransceiver() {}
      async createOffer() {
        return { type: 'offer', sdp: 'x' };
      }
      async createAnswer() {
        return { type: 'answer', sdp: 'x' };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      async addIceCandidate() {}
      close() {}
    }

    const video = createTDVideoStream({
      connection,
      RTCPeerConnection: FakePC as never,
      MediaStream: FakeMedia as never,
    });
    td.socket().serverSend({ type: 'snapshot', params: {} });
    await flush();

    peer.ontrack({ track: makeTrack('first'), transceiver: { mid: '0' } });
    peer.ontrack({ track: makeTrack('second'), transceiver: { mid: '0' } });

    expect(stopped).toEqual(['first']);
    video.close();
    expect(stopped).toEqual(['first', 'second']);
  });
});
