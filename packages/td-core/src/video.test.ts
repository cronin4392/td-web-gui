/**
 * WebRTC tests, driven against the faked `RTCPeerConnection` and
 * the mock TD server so every signaling and recovery path runs without real
 * media: offer/answer + trickle ICE (5.2), the `streams` id→mid map (5.3),
 * connectionState-driven rebuild (5.5), WS-reconnect recovery and deferred
 * renegotiation (5.6), and track-stopping teardown (5.8).
 */

import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTDConnection } from './connection';
import { createMockTD, type MockTDHandle, type MockTDSocket } from './testing/mockTD';
import {
  MockMediaStreamCtor,
  MockPeerConnection,
  MockRTCPeerConnection,
  trackOf,
} from './testing/mockRTC';
import { createManualScheduler, type ManualScheduler } from './testing/scheduler';
import { createTDVideoStream, type TDVideoStream, type TDVideoStreamOptions } from './video';

beforeEach(() => {
  MockPeerConnection.reset();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Let the pending microtask chain drain. Signaling is several `await`s deep
 * (createOffer → setLocalDescription → send), so a couple of ticks isn't enough.
 */
async function settle(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

const SIGNALING_TYPES = ['rtc-offer', 'rtc-answer', 'rtc-ice', 'streams'];

interface Harness {
  td: MockTDHandle;
  sched: ManualScheduler;
  video: TDVideoStream;
  connection: ReturnType<typeof createTDConnection>;
  dispose: () => void;
  /** Signaling frames the client sent on the *current* socket, in order. */
  signaling: (socket?: MockTDSocket) => any[];
}

async function setup(
  options: Partial<Omit<TDVideoStreamOptions, 'connection'>> = {},
): Promise<Harness> {
  const td = createMockTD({ snapshot: {} });
  const sched = createManualScheduler();
  let video!: TDVideoStream;
  let connection!: ReturnType<typeof createTDConnection>;

  const dispose = createRoot((d) => {
    connection = createTDConnection('ws://test', {
      WebSocket: td.WebSocket,
      scheduler: sched.scheduler,
      random: () => 0,
    });
    video = createTDVideoStream({
      connection,
      RTCPeerConnection: MockRTCPeerConnection,
      MediaStream: MockMediaStreamCtor,
      scheduler: sched.scheduler,
      ...options,
    });
    return d;
  });

  // Handshake completes, the snapshot lands, and the peer is built + offers.
  await settle();

  return {
    td,
    sched,
    video,
    connection,
    dispose,
    signaling: (socket = td.socket()) =>
      socket.received.filter((m: any) => SIGNALING_TYPES.includes(m?.type)) as any[],
  };
}

describe('peer setup + offer (5.2)', () => {
  it('waits for the WS snapshot before building the peer', async () => {
    const td = createMockTD({ autoHandshake: false });
    const sched = createManualScheduler();
    const dispose = createRoot((d) => {
      createTDVideoStream({
        connection: createTDConnection('ws://test', {
          WebSocket: td.WebSocket,
          scheduler: sched.scheduler,
        }),
        RTCPeerConnection: MockRTCPeerConnection,
        scheduler: sched.scheduler,
      });
      return d;
    });
    await settle();

    // Offering into a socket whose handshake never completed would wedge the
    // peer in have-local-offer with no answer coming.
    expect(MockPeerConnection.instances).toHaveLength(0);
    dispose();
  });

  it('offers recvonly video and sends the SDP over the same socket', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();

    expect(peer.config.iceServers).toEqual([]); // host candidates only on localhost
    expect(peer.transceivers).toEqual([{ kind: 'video', direction: 'recvonly' }]);
    expect(h.signaling()).toEqual([{ type: 'rtc-offer', sdp: 'offer-sdp-1' }]);
    h.dispose();
  });

  it('opens one m-line per requested receiver', async () => {
    const h = await setup({ receivers: 3 });
    expect(MockPeerConnection.latest().transceivers).toHaveLength(3);
    h.dispose();
  });

  it('never offers first when TD holds the offer role, but still answers', async () => {
    const h = await setup({ offerRole: 'td' });
    expect(MockPeerConnection.latest().transceivers).toHaveLength(0);
    expect(h.signaling()).toEqual([]);

    h.td.socket().serverSend({ type: 'rtc-offer', sdp: 'td-offer' });
    await settle();
    expect(h.signaling()).toEqual([{ type: 'rtc-answer', sdp: 'answer-sdp' }]);
    h.dispose();
  });

  it('applies TD’s answer to our offer', async () => {
    const h = await setup();
    h.td.socket().serverSend({ type: 'rtc-answer', sdp: 'td-answer' });
    await settle();

    expect(MockPeerConnection.latest().remoteDescription).toEqual({
      type: 'answer',
      sdp: 'td-answer',
    });
    h.dispose();
  });

  it('rolls its own offer back when TD offers at the same time', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    expect(peer.signalingState).toBe('have-local-offer');

    h.td.socket().serverSend({ type: 'rtc-offer', sdp: 'td-offer' });
    await settle();

    // The browser yields rather than leaving the peer wedged mid-negotiation.
    expect(peer.localDescriptions.map((d) => d.type)).toEqual(['offer', 'rollback', 'answer']);
    expect(h.signaling().at(-1)).toEqual({ type: 'rtc-answer', sdp: 'answer-sdp' });
    h.dispose();
  });
});

describe('trickle ICE both ways (5.2)', () => {
  it('sends local candidates with their full descriptor, then end-of-candidates', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();

    peer.emitIceCandidate({ candidate: 'candidate:1 1 udp', sdpMid: '0', sdpMLineIndex: 0 });
    peer.emitIceCandidate(null);

    expect(h.signaling().slice(1)).toEqual([
      { type: 'rtc-ice', candidate: 'candidate:1 1 udp', sdpMid: '0', sdpMLineIndex: 0 },
      { type: 'rtc-ice', candidate: null },
    ]);
    h.dispose();
  });

  it('buffers inbound candidates until a remote description exists', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();

    // Applying these now would throw — there is no remote description yet.
    h.td.socket().serverSend({ type: 'rtc-ice', candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 });
    h.td.socket().serverSend({ type: 'rtc-ice', candidate: null });
    await settle();
    expect(peer.addedCandidates).toEqual([]);

    h.td.socket().serverSend({ type: 'rtc-answer', sdp: 'td-answer' });
    await settle();
    expect(peer.addedCandidates).toEqual([
      { candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 },
      null, // end-of-candidates forwarded as addIceCandidate(null)
    ]);
    h.dispose();
  });

  it('applies candidates immediately once the remote description is set', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    h.td.socket().serverSend({ type: 'rtc-answer', sdp: 'td-answer' });
    await settle();

    h.td.socket().serverSend({ type: 'rtc-ice', candidate: 'late', sdpMid: '1', sdpMLineIndex: 1 });
    await settle();
    expect(peer.addedCandidates).toEqual([{ candidate: 'late', sdpMid: '1', sdpMLineIndex: 1 }]);
    h.dispose();
  });
});

describe('streams mapping (5.3)', () => {
  it('maps each announced id onto the track carried by its mid', async () => {
    const h = await setup({ receivers: 2 });
    const peer = MockPeerConnection.latest();
    const main = peer.emitTrack('0');
    const preview = peer.emitTrack('1');

    h.td.socket().serverSend({
      type: 'streams',
      streams: [
        { id: 'main', mid: '0', label: 'Render A' },
        { id: 'preview', mid: '1' },
      ],
    });
    await settle();

    expect(h.video.streams()).toHaveLength(2);
    expect(trackOf(h.video.stream('main'))).toBe(main);
    expect(trackOf(h.video.stream('preview'))).toBe(preview);
    expect(trackOf(h.video.stream())).toBe(main); // no id → the primary stream
    expect(h.video.stream('nope')).toBeUndefined(); // never announced
    h.dispose();
  });

  it('rebinds when a renegotiation shifts an id onto a different mid', async () => {
    const h = await setup({ receivers: 2 });
    const peer = MockPeerConnection.latest();
    const first = peer.emitTrack('0');
    const second = peer.emitTrack('1');

    h.td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '0' }] });
    await settle();
    expect(trackOf(h.video.stream('main'))).toBe(first);

    // TD renegotiated and re-sent the map with `main` now on mid 1.
    h.td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '1' }] });
    await settle();
    expect(trackOf(h.video.stream('main'))).toBe(second);
    h.dispose();
  });

  it('hands every caller of one id the same MediaStream', async () => {
    const h = await setup();
    MockPeerConnection.latest().emitTrack('0');
    h.td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '0' }] });
    await settle();

    // What lets N <Video> tiles on one id share a single decode.
    expect(h.video.stream('main')).toBe(h.video.stream('main'));
    h.dispose();
  });

  it('gives every mid its own picture when TD announces all tracks in one stream', async () => {
    const h = await setup({ receivers: 8 });
    const peer = MockPeerConnection.latest();
    const tracks = Array.from({ length: 8 }, (_, i) => peer.emitTrack(String(i)));

    h.td.socket().serverSend({
      type: 'streams',
      streams: tracks.map((_, i) => ({ id: `tile${i + 1}`, mid: String(i) })),
    });
    await settle();

    // The 8-tile wall (6.7). TD reports one msid for the whole peer, so
    // `event.streams[0]` is the same 8-track object on every mid — and a
    // <video> plays only the first video track of what it's given, so binding
    // to it silently renders tile 1 eight times.
    const bound = tracks.map((_, i) => h.video.stream(`tile${i + 1}`));
    expect(bound.map(trackOf)).toEqual(tracks);
    expect(new Set(bound).size).toBe(8);
    for (const media of bound) expect(media!.getTracks()).toHaveLength(1);
    h.dispose();
  });
});

describe('per-stream status + rebuild on failure (5.5)', () => {
  it('reports a stream connected only once its track has arrived', async () => {
    const h = await setup();
    expect(h.video.status()).toBe('connecting');

    MockPeerConnection.latest().setConnectionState('connected');
    expect(h.video.status()).toBe('connected');
    expect(h.video.streamStatus('main')).toBe('connecting'); // peer up, track not yet

    MockPeerConnection.latest().emitTrack('0');
    h.td.socket().serverSend({ type: 'streams', streams: [{ id: 'main', mid: '0' }] });
    await settle();
    expect(h.video.streamStatus('main')).toBe('connected');
    h.dispose();
  });

  it('rebuilds the peer from scratch on failed', async () => {
    const h = await setup();
    const first = MockPeerConnection.latest();
    first.setConnectionState('connected');

    first.setConnectionState('failed');
    await settle();

    expect(first.closed).toBe(true);
    expect(MockPeerConnection.instances).toHaveLength(2); // rebuilt, not ICE-restarted
    expect(h.video.status()).toBe('reconnecting');
    // The replacement re-offers, so recovery takes the same path as connect.
    expect(h.signaling().at(-1)).toEqual({ type: 'rtc-offer', sdp: 'offer-sdp-1' });
    h.dispose();
  });

  it('gives a disconnected peer a grace period before rebuilding', async () => {
    const h = await setup({ disconnectedGrace: 2_000 });
    const peer = MockPeerConnection.latest();
    peer.setConnectionState('connected');

    peer.setConnectionState('disconnected');
    expect(h.video.status()).toBe('reconnecting');

    // Recovers inside the window: no rebuild, and the timer is disarmed.
    h.sched.advance(1_000);
    peer.setConnectionState('connected');
    h.sched.advance(5_000);
    await settle();
    expect(MockPeerConnection.instances).toHaveLength(1);
    expect(h.video.status()).toBe('connected');

    // Sustained past the window: treated as dead.
    peer.setConnectionState('disconnected');
    h.sched.advance(2_000);
    await settle();
    expect(MockPeerConnection.instances).toHaveLength(2);
    h.dispose();
  });

  it('falls back to iceConnectionState when connectionState is unavailable', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    (peer as { connectionState?: string }).connectionState = undefined;
    peer.iceConnectionState = 'completed';
    peer.onconnectionstatechange?.();

    expect(h.video.status()).toBe('connected');
    h.dispose();
  });
});

describe('WS-reconnect recovery + deferred renegotiation (5.6)', () => {
  it('leaves a healthy peer alone across a WS blip', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    peer.setConnectionState('connected');
    const track = peer.emitTrack('0');

    h.td.socket().close();
    h.sched.advance(250); // backoff, then a fresh handshake + snapshot
    await settle();

    expect(h.connection.status()).toBe('synced');
    // Media is its own transport — nothing was torn down.
    expect(MockPeerConnection.instances).toHaveLength(1);
    expect(peer.closed).toBe(false);
    expect(track.stopped).toBe(false);
    h.dispose();
  });

  it('rebuilds a peer that died while the WS was down', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    peer.setConnectionState('connected');

    h.td.socket().close();
    peer.setConnectionState('failed'); // rebuilds once immediately
    MockPeerConnection.latest().setConnectionState('closed'); // and that one dies too
    const before = MockPeerConnection.instances.length;

    h.sched.advance(250);
    await settle();

    // The WS-reconnect hook found a dead peer and rebuilt it.
    expect(MockPeerConnection.instances.length).toBeGreaterThan(before);
    h.dispose();
  });

  it('defers negotiation requested while the WS is down and flushes it on reconnect', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    peer.setConnectionState('connected');

    const droppedSocket = h.td.socket();
    const sentBefore = droppedSocket.received.length;
    droppedSocket.close();

    // TD added a track during the blip: the peer wants to renegotiate, but there
    // is no signaling channel to carry the offer.
    peer.onnegotiationneeded?.();
    await settle();
    expect(droppedSocket.received).toHaveLength(sentBefore);

    h.sched.advance(250);
    await settle();

    // Same peer, offer flushed onto the fresh socket rather than dropped.
    expect(MockPeerConnection.instances).toHaveLength(1);
    expect(h.signaling()).toEqual([{ type: 'rtc-offer', sdp: 'offer-sdp-1' }]);
    h.dispose();
  });
});

describe('teardown (5.8)', () => {
  it('closes the peer and stops every received track', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    const main = peer.emitTrack('0');

    h.dispose();

    expect(peer.closed).toBe(true);
    // Stopping the track is what frees the hardware decoder.
    expect(main.stopped).toBe(true);
    expect(h.video.status()).toBe('closed');
  });

  it('stops the old tracks when a rebuild replaces the peer', async () => {
    const h = await setup();
    const first = MockPeerConnection.latest();
    const track = first.emitTrack('0');

    first.setConnectionState('failed');
    await settle();

    expect(track.stopped).toBe(true);
    h.dispose();
  });

  it('ignores signaling that arrives for a torn-down peer', async () => {
    const h = await setup();
    const peer = MockPeerConnection.latest();
    h.dispose();

    h.td.socket().serverSend({ type: 'rtc-answer', sdp: 'too-late' });
    await settle();
    expect(peer.remoteDescription).toBeNull();
  });
});
