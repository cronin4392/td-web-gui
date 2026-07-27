/**
 * `createTDVideoStream(config)` — the WebRTC peer for one TD instance.
 *
 * v1 media is **video, TD → web only**. One peer per instance carries *all* of
 * that instance's video tracks (rather than a peer per stream), which keeps
 * connection and ICE overhead down when an instance serves several streams;
 * `<Video stream="...">` selects among them via the `id` → `mid` map TD
 * announces in `streams`.
 *
 * ## Signaling
 * Multiplexed over the *same* WebSocket as control data: offers/answers/ICE go
 * out through `connection.send()` and arrive through `connection.subscribe()`.
 * No second socket, no extra TD component.
 *
 * ## Offer role — resolved: the browser offers
 * The proposal left open whether the browser or TD sends the initial SDP offer.
 * This resolves it as **browser-offers on connect and on rebuild**, because:
 *  - only the browser knows when it wants a peer (first sync, or a rebuild after
 *    a failure), and browser-offers needs no "please offer" message to trigger
 *    TD — the connect and rebuild paths stay identical, which is exactly the
 *    symmetry the open question asked for;
 *  - v1 media is TD → web, so the browser contributes no tracks and expresses
 *    its interest as `recvonly` video transceivers — the standard shape for a
 *    receive-only peer.
 *
 * TD may still offer *later* — only an offerer can add m-lines, so a TD instance
 * that starts a new track has to drive that renegotiation itself. Inbound
 * offers are therefore handled for the whole life of the peer, and a collision
 * with our own offer is resolved by the browser yielding (rollback + answer).
 * `offerRole: 'td'` flips the initial role in one option if the reference
 * WebRTC DAT turns out to insist on offering first.
 */

import { createSignal, getOwner, onCleanup, type Accessor } from 'solid-js';
import type { TDConnection } from './connection';
import { defaultScheduler, type TDScheduler } from './scheduler';
import type { RTCIceMessage, StreamInfo } from './wire';

/** ~2s of `disconnected` before a peer is treated as dead (see § "WebRTC resilience"). */
const DEFAULT_DISCONNECTED_GRACE = 2_000;

/**
 * Per-peer lifecycle, mirroring the WebSocket `status` pattern.
 * `connecting` → `connected`; a failure flips to `reconnecting` (what drives a
 * "reconnecting" overlay instead of a frozen last frame) and stays there across
 * the rebuild until media flows again. `closed` is terminal.
 */
export type TDPeerStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * The slice of `MediaStream` this module uses. Stated structurally — like
 * `WebSocketLike` on the connection — so a faked `RTCPeerConnection` can hand
 * back plain objects in tests. `<Video>` assigns it to `srcObject`, where it is
 * a real `MediaStream` at runtime.
 */
export interface MediaStreamLike {
  readonly id: string;
  getTracks(): { stop(): void }[];
}

/** Constructor for a {@link MediaStreamLike}; the global one at runtime. */
export interface MediaStreamLikeConstructor {
  new (tracks: unknown[]): MediaStreamLike;
}

/** ICE candidate as `addIceCandidate()` takes it; `null` = end-of-candidates. */
export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

interface SessionDescriptionLike {
  type: string;
  sdp?: string;
}

interface TrackEventLike {
  track: { stop(): void };
  streams?: readonly MediaStreamLike[];
  transceiver?: { mid?: string | null };
}

/**
 * The slice of the browser `RTCPeerConnection` surface used here, stated
 * structurally so tests can inject a fake without implementing the full API
 * (same approach as `WebSocketLike`).
 */
export interface RTCPeerConnectionLike {
  readonly connectionState?: string;
  readonly iceConnectionState?: string;
  readonly signalingState?: string;
  readonly localDescription?: SessionDescriptionLike | null;
  addTransceiver(kind: string, init?: { direction?: string }): unknown;
  createOffer(): Promise<SessionDescriptionLike>;
  createAnswer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description?: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: SessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: IceCandidateInit | null): Promise<void>;
  close(): void;
  onicecandidate: ((event: { candidate: IceCandidateInit | null }) => void) | null;
  ontrack: ((event: TrackEventLike) => void) | null;
  onnegotiationneeded: (() => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
}

/** Constructor for a {@link RTCPeerConnectionLike}. */
export interface RTCPeerConnectionLikeConstructor {
  new (config: { iceServers: unknown[] }): RTCPeerConnectionLike;
}

export interface TDVideoStreamOptions {
  /** The signaling connection this peer rides. Owned by the caller. */
  connection: TDConnection;
  /**
   * ICE servers. Defaults to `[]` — browser and TD are on the same machine, so
   * host candidates alone always pair and no STUN/TURN is needed, which also
   * keeps gathering near-instant when several peers come up at once.
   *
   * Note those host candidates are *not* loopback in practice: Chrome emits an
   * mDNS `.local` name (it hides local IPs by default) and TD offers its LAN
   * interface. Both resolve locally and pair fine — worth knowing before
   * treating a non-`127.0.0.1` candidate as the cause of a failure. Kept as an option
   * so the same lib works if TD ever runs on another box.
   */
  iceServers?: unknown[];
  /** `RTCPeerConnection` constructor. Defaults to the global; faked in tests. */
  RTCPeerConnection?: RTCPeerConnectionLikeConstructor;
  /** `MediaStream` constructor. Defaults to the global; faked in tests. */
  MediaStream?: MediaStreamLikeConstructor;
  /** Timer scheduler; defaults to the platform globals. Injected in tests. */
  scheduler?: TDScheduler;
  /**
   * How many `recvonly` video m-lines our offer carries — i.e. the most tracks
   * TD can attach without renegotiating. Default 1. Only meaningful when this
   * side offers; TD can always add more later by offering itself.
   */
  receivers?: number;
  /** Which side sends the initial offer. Default `'browser'` (see § "Offer role"). */
  offerRole?: 'browser' | 'td';
  /** Grace before a `disconnected` peer is rebuilt (ms). Default 2000. */
  disconnectedGrace?: number;
}

export interface TDVideoStream {
  /** Reactive peer-wide status. */
  status: Accessor<TDPeerStatus>;
  /** Reactive: the `id`/`mid`/`label` list TD last announced. */
  streams: Accessor<StreamInfo[]>;
  /**
   * The decoded `MediaStream` for a stream id, or `undefined` until its track
   * arrives. Omitting `id` selects the primary stream (the only announced one).
   * Every caller for the same id gets the *same* `MediaStream` object, so N
   * `<Video>` elements on one id share a single decode.
   */
  stream: (id?: string) => MediaStreamLike | undefined;
  /**
   * Reactive status for one stream: the peer status, except that a stream whose
   * track hasn't arrived yet reads `connecting`/`reconnecting` rather than
   * `connected`.
   */
  streamStatus: (id?: string) => TDPeerStatus;
  /** Tear down and re-negotiate the peer from scratch. */
  rebuild: () => void;
  /** Close the peer, stop every received track, and unsubscribe from signaling. */
  close: () => void;
}

export function createTDVideoStream(options: TDVideoStreamOptions): TDVideoStream {
  const { connection } = options;
  const PC: RTCPeerConnectionLikeConstructor =
    options.RTCPeerConnection ??
    (globalThis as { RTCPeerConnection?: RTCPeerConnectionLikeConstructor }).RTCPeerConnection!;
  const Media: MediaStreamLikeConstructor | undefined =
    options.MediaStream ?? (globalThis as { MediaStream?: MediaStreamLikeConstructor }).MediaStream;
  const scheduler = options.scheduler ?? defaultScheduler;
  const iceServers = options.iceServers ?? [];
  const receivers = options.receivers ?? 1;
  const offerRole = options.offerRole ?? 'browser';
  const disconnectedGrace = options.disconnectedGrace ?? DEFAULT_DISCONNECTED_GRACE;

  const [status, setStatus] = createSignal<TDPeerStatus>('connecting');
  const [streams, setStreams] = createSignal<StreamInfo[]>([]);
  // mid → decoded stream. Keyed by `mid` (not stream id) because that's what
  // `ontrack` reports; the `streams` message is what maps ids onto it, and
  // re-arrives on every renegotiation in case mids shifted.
  const [tracks, setTracks] = createSignal<ReadonlyMap<string, MediaStreamLike>>(new Map());

  let peer: RTCPeerConnectionLike | null = null;
  let disposed = false;
  // Monotonic id of the current peer. Bumping it invalidates in-flight async
  // signaling from a peer we've already torn down, so a late `createAnswer`
  // resolution can't send SDP for a dead connection.
  let peerId = 0;
  let makingOffer = false;
  let negotiationPending = false;
  let remoteDescribed = false;
  let graceTimer: number | null = null;
  // ICE that arrived before a remote description exists; `addIceCandidate`
  // would throw, so it's queued in order (including the `null` terminator).
  const pendingCandidates: (IceCandidateInit | null)[] = [];

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Whether the signaling socket can carry a message right now. */
  function signalingOpen(): boolean {
    const s = connection.status();
    return s === 'open' || s === 'synced';
  }

  function peerState(pc: RTCPeerConnectionLike): string {
    // `iceConnectionState` is the documented fallback for older behavior; its
    // values overlap `connectionState`'s closely enough to read the same way.
    return pc.connectionState ?? pc.iceConnectionState ?? 'new';
  }

  function clearGrace() {
    if (graceTimer !== null) {
      scheduler.clearTimeout(graceTimer);
      graceTimer = null;
    }
  }

  // ── peer lifecycle ─────────────────────────────────────────────────────────

  /**
   * Close the current peer and release its media. Stopping the tracks (rather
   * than just dropping the reference) is what frees the hardware decoder — a
   * detached `<video>` alone keeps it (5.8).
   */
  function teardownPeer() {
    peerId++;
    clearGrace();
    pendingCandidates.length = 0;
    remoteDescribed = false;
    makingOffer = false;

    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onnegotiationneeded = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      try {
        peer.close();
      } catch {
        // ignore — peer may already be closed
      }
      peer = null;
    }

    for (const media of new Set(tracks().values())) {
      for (const track of media.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore — track may already be ended
        }
      }
    }
    setTracks(new Map());
  }

  function build() {
    if (disposed) return;
    teardownPeer();

    const myId = peerId;
    const isCurrent = () => myId === peerId && !disposed;
    const pc = new PC({ iceServers });
    peer = pc;

    pc.onicecandidate = (event) => {
      if (!isCurrent()) return;
      const candidate = event.candidate;
      connection.send(
        candidate
          ? {
              type: 'rtc-ice',
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid ?? null,
              sdpMLineIndex: candidate.sdpMLineIndex ?? null,
            }
          : { type: 'rtc-ice', candidate: null }, // end-of-candidates
      );
    };
    pc.ontrack = (event) => {
      if (isCurrent()) registerTrack(event);
    };
    pc.onnegotiationneeded = () => {
      if (isCurrent()) void negotiate(myId);
    };
    pc.onconnectionstatechange = () => {
      if (isCurrent()) syncPeerState();
    };
    pc.oniceconnectionstatechange = () => {
      if (isCurrent()) syncPeerState();
    };

    if (offerRole === 'browser') {
      // We contribute no media (TD → web only), so `recvonly` transceivers are
      // what put video m-lines in our offer for TD to fill. Adding them fires
      // `onnegotiationneeded`, which is what actually sends the offer — the same
      // path every later renegotiation takes.
      for (let i = 0; i < receivers; i++) {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }
    }
  }

  function rebuild(reason: string) {
    if (disposed) return;
    console.debug('[td-core] rebuilding video peer:', reason);
    build();
    // Stay in `reconnecting` (not `connecting`) so an overlay shown on failure
    // doesn't flicker off while the replacement peer negotiates.
    setStatus('reconnecting');
  }

  /**
   * Map `connectionState` onto the peer status, rebuilding on failure.
   * Rebuild-don't-ICE-restart: on localhost the real failure mode is one end
   * going away entirely (a `.toe` reload, the WebRTC DAT re-cooking), which an
   * ICE restart can't fix.
   */
  function syncPeerState() {
    const pc = peer;
    if (!pc) return;

    switch (peerState(pc)) {
      case 'connected':
      case 'completed':
        clearGrace();
        setStatus('connected');
        break;
      case 'failed':
        setStatus('reconnecting');
        rebuild('connection failed');
        break;
      case 'disconnected':
        setStatus('reconnecting');
        // `disconnected` is often transient, so only a sustained one counts as
        // dead. The timer is armed once and cleared by any recovery.
        if (graceTimer === null) {
          graceTimer = scheduler.setTimeout(() => {
            graceTimer = null;
            rebuild('disconnected past grace');
          }, disconnectedGrace);
        }
        break;
      case 'closed':
        break;
      default: // 'new' | 'connecting' | 'checking'
        clearGrace();
        if (status() !== 'reconnecting') setStatus('connecting');
    }
  }

  // ── media ──────────────────────────────────────────────────────────────────

  function registerTrack(event: TrackEventLike) {
    const mid = event.transceiver?.mid;
    if (mid == null) {
      console.debug('[td-core] ignoring track with no mid');
      return;
    }
    const media = wrapTrack(event.track) ?? event.streams?.[0];
    if (!media) return;
    setTracks((prev) => new Map(prev).set(mid, media));
  }

  /**
   * Give a track its own `MediaStream`, keyed by mid — deliberately *not*
   * `event.streams[0]`.
   *
   * TD announces every track of a peer inside one stream
   * (`TouchDesigner_webrtc1`), so the peer-level stream is the *same* N-track
   * object on every mid — and a `<video>` renders only the first video track of
   * whatever it is handed. Binding tiles to it makes an 8-stream wall show
   * tile 1 eight times, with no error anywhere to say so. Wrapping each track
   * keeps id → mid → picture honest, and is also the fallback for a track sent
   * with no stream at all.
   *
   * This treats msid grouping as meaningless, which holds while media is
   * video-only (v1). Pairing an audio track with its video would have to come
   * through the `streams` announce map, not through the peer's msid.
   */
  function wrapTrack(track: { stop(): void }): MediaStreamLike | undefined {
    if (!Media) {
      console.debug('[td-core] MediaStream is unavailable; falling back to the peer stream');
      return undefined;
    }
    return new Media([track]);
  }

  /** Resolve a stream id to its announced `mid`, defaulting to the primary. */
  function midFor(id?: string): string | undefined {
    const announced = streams();
    if (id === undefined) {
      // No id asked for: the primary stream — the announced one when there's
      // exactly one, otherwise the first, so a single-stream app never needs ids.
      return announced[0]?.mid;
    }
    return announced.find((s) => s.id === id)?.mid;
  }

  function stream(id?: string): MediaStreamLike | undefined {
    const mid = midFor(id);
    return mid === undefined ? undefined : tracks().get(mid);
  }

  function streamStatus(id?: string): TDPeerStatus {
    const peerStatus = status();
    if (peerStatus === 'connected' && !stream(id)) return 'connecting';
    return peerStatus;
  }

  // ── signaling ──────────────────────────────────────────────────────────────

  async function negotiate(myId: number) {
    const pc = peer;
    if (!pc || myId !== peerId || disposed) return;

    if (!signalingOpen()) {
      // Renegotiation needs the signaling channel. Record it rather than drop
      // it: the WS-reconnect hook flushes pending negotiation, so a track that
      // appeared during a WS blip still binds (§ "Deferred renegotiation").
      negotiationPending = true;
      return;
    }
    negotiationPending = false;

    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (myId !== peerId || disposed) return;
      const sdp = pc.localDescription?.sdp ?? offer.sdp;
      if (sdp) connection.send({ type: 'rtc-offer', sdp });
    } catch (error) {
      console.error('[td-core] failed to create offer', error);
    } finally {
      makingOffer = false;
    }
  }

  async function handleOffer(sdp: string, myId: number) {
    const pc = peer;
    if (!pc || myId !== peerId) return;
    try {
      // Glare: TD offered while our own offer was in flight. The browser is the
      // polite peer here — roll ours back and answer theirs, rather than leaving
      // the peer wedged in `have-local-offer`.
      if (makingOffer || (pc.signalingState && pc.signalingState !== 'stable')) {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription({ type: 'offer', sdp });
      if (myId !== peerId) return;
      remoteDescribed = true;
      await flushCandidates(myId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (myId !== peerId) return;
      const local = pc.localDescription?.sdp ?? answer.sdp;
      if (local) connection.send({ type: 'rtc-answer', sdp: local });
    } catch (error) {
      console.error('[td-core] failed to answer offer', error);
    }
  }

  async function handleAnswer(sdp: string, myId: number) {
    const pc = peer;
    if (!pc || myId !== peerId) return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp });
      if (myId !== peerId) return;
      remoteDescribed = true;
      await flushCandidates(myId);
    } catch (error) {
      console.error('[td-core] failed to apply answer', error);
    }
  }

  async function handleIce(message: RTCIceMessage, myId: number) {
    const pc = peer;
    if (!pc || myId !== peerId) return;
    const init: IceCandidateInit | null =
      message.candidate === null
        ? null
        : {
            candidate: message.candidate,
            sdpMid: message.sdpMid ?? null,
            sdpMLineIndex: message.sdpMLineIndex ?? null,
          };
    if (!remoteDescribed) {
      pendingCandidates.push(init);
      return;
    }
    await addCandidate(pc, init);
  }

  async function flushCandidates(myId: number) {
    const queued = pendingCandidates.splice(0);
    for (const candidate of queued) {
      const pc = peer;
      if (!pc || myId !== peerId) return;
      await addCandidate(pc, candidate);
    }
  }

  async function addCandidate(pc: RTCPeerConnectionLike, init: IceCandidateInit | null) {
    try {
      await pc.addIceCandidate(init);
    } catch (error) {
      // A rejected candidate is not fatal — the others may still connect, and a
      // genuinely dead peer is caught by the connectionState monitor.
      console.debug('[td-core] failed to add ICE candidate', error);
    }
  }

  /**
   * Called on every `snapshot` — i.e. once per completed (re)connect, since the
   * handshake always ends in one. Media rides its own transport, so a WS blip
   * must **not** tear down a healthy peer; only dead peers are rebuilt, and
   * negotiation deferred across the gap is flushed on the survivors.
   */
  function onSignalingReady() {
    if (disposed) return;
    if (!peer) {
      build();
      setStatus('connecting');
      return;
    }
    const state = peerState(peer);
    if (state === 'failed' || state === 'closed') rebuild('ws reconnect, peer dead');
    else if (negotiationPending) void negotiate(peerId);
  }

  const unsubscribe = connection.subscribe((message) => {
    switch (message.type) {
      case 'snapshot':
        onSignalingReady();
        break;
      case 'rtc-offer':
        void handleOffer(message.sdp, peerId);
        break;
      case 'rtc-answer':
        void handleAnswer(message.sdp, peerId);
        break;
      case 'rtc-ice':
        void handleIce(message, peerId);
        break;
      case 'streams':
        // Re-sent by TD on every (re)negotiation: replacing the map wholesale is
        // what rebinds `<Video>` when mids shift.
        setStreams(message.streams);
        break;
    }
  });

  function close() {
    disposed = true;
    unsubscribe();
    teardownPeer();
    setStreams([]);
    setStatus('closed');
  }

  // The peer is built on the first `snapshot`, not here: signaling needs a live
  // socket, and offering into a socket that isn't open yet would just wedge the
  // peer in `have-local-offer` with no answer coming.

  if (getOwner()) onCleanup(close);

  return { status, streams, stream, streamStatus, rebuild: () => rebuild('manual'), close };
}
