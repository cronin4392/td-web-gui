/**
 * Faked `RTCPeerConnection` (Phase 5.7) — a deterministic stand-in for the
 * browser's peer connection, so the signaling and rebuild paths are testable in
 * CI. Real media can't be meaningfully faked; that stays a manual check against
 * the reference TD project (Phase 6.8).
 *
 * It implements only the {@link RTCPeerConnectionLike} slice `video.ts` uses,
 * and gives the test script over the peer's side of the exchange: fire ICE
 * candidates, deliver a track, or drive `connectionState` to `failed`.
 */

import type {
  IceCandidateInit,
  MediaStreamLike,
  RTCPeerConnectionLike,
} from '../video'

/** A faked track that records whether `stop()` was called (Phase 5.8). */
export class MockTrack {
  stopped = false
  stop(): void {
    this.stopped = true
  }
}

/** A faked `MediaStream` wrapping one or more {@link MockTrack}s. */
export class MockMediaStream implements MediaStreamLike {
  constructor(
    readonly id: string,
    readonly tracks: MockTrack[] = [new MockTrack()],
  ) {}
  getTracks(): MockTrack[] {
    return this.tracks
  }
}

export class MockPeerConnection implements RTCPeerConnectionLike {
  /** Every peer built during a test, oldest first — a rebuild appends. */
  static readonly instances: MockPeerConnection[] = []

  static reset(): void {
    MockPeerConnection.instances.length = 0
  }

  /** The most recently constructed peer. */
  static latest(): MockPeerConnection {
    const peer = MockPeerConnection.instances.at(-1)
    if (!peer) throw new Error('no MockPeerConnection has been constructed')
    return peer
  }

  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  localDescription: { type: string; sdp?: string } | null = null
  remoteDescription: { type: string; sdp?: string } | null = null

  closed = false
  /** Transceivers added by the connection, in order. */
  readonly transceivers: { kind: string; direction?: string }[] = []
  /** Candidates handed to `addIceCandidate`, in order (`null` = end-of-candidates). */
  readonly addedCandidates: (IceCandidateInit | null)[] = []
  /** Local descriptions applied, in order — includes `{ type: 'rollback' }`. */
  readonly localDescriptions: { type: string; sdp?: string }[] = []

  onicecandidate: ((event: { candidate: IceCandidateInit | null }) => void) | null = null
  ontrack: ((event: any) => void) | null = null
  onnegotiationneeded: (() => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null

  constructor(readonly config: { iceServers: unknown[] }) {
    MockPeerConnection.instances.push(this)
  }

  addTransceiver(kind: string, init?: { direction?: string }): unknown {
    this.transceivers.push({ kind, direction: init?.direction })
    // Real browsers fire this asynchronously once the transceiver is added; the
    // connection relies on the event (never on `addTransceiver` returning) to
    // send its offer, so the fake has to fire it too.
    queueMicrotask(() => this.onnegotiationneeded?.())
    return {}
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: `offer-sdp-${this.transceivers.length}` }
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'answer-sdp' }
  }

  async setLocalDescription(description?: { type: string; sdp?: string }): Promise<void> {
    const desc = description ?? { type: 'offer', sdp: 'offer-sdp' }
    this.localDescriptions.push(desc)
    if (desc.type === 'rollback') {
      this.signalingState = 'stable'
      this.localDescription = null
      return
    }
    this.localDescription = desc
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable'
  }

  async setRemoteDescription(description: { type: string; sdp?: string }): Promise<void> {
    this.remoteDescription = description
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'
  }

  async addIceCandidate(candidate: IceCandidateInit | null): Promise<void> {
    if (!this.remoteDescription) {
      throw new Error('cannot add ICE candidate before a remote description')
    }
    this.addedCandidates.push(candidate)
  }

  close(): void {
    this.closed = true
    this.connectionState = 'closed'
  }

  // ── test-side drivers ──────────────────────────────────────────────────────

  /** Emit a trickled local candidate; `null` signals end-of-candidates. */
  emitIceCandidate(candidate: IceCandidateInit | null): void {
    this.onicecandidate?.({ candidate })
  }

  /** Deliver an inbound track on `mid`, as `ontrack` would. */
  emitTrack(mid: string, stream = new MockMediaStream(`stream-${mid}`)): MockMediaStream {
    this.ontrack?.({ track: stream.getTracks()[0], streams: [stream], transceiver: { mid } })
    return stream
  }

  /** Drive `connectionState` and fire the change event. */
  setConnectionState(state: string): void {
    this.connectionState = state
    this.onconnectionstatechange?.()
  }
}

/** Inject as `options.RTCPeerConnection` into `createTDVideoStream`. */
export const MockRTCPeerConnection = MockPeerConnection as unknown as new (config: {
  iceServers: unknown[]
}) => RTCPeerConnectionLike
