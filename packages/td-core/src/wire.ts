/**
 * Wire format — the typed JSON discriminated-union envelope spoken over the
 * WebSocket between the web UI and TouchDesigner.
 *
 * Phase 2 covered the control-data subset: `hello`, `welcome`,
 * `snapshot-request`, `snapshot`, and `update`. Phase 3 (WebSocket hardening)
 * added the connection-liveness and error messages — `ping`/`pong` (app-level
 * heartbeat) and `error` (surfaced, non-fatal). Phase 4 adds `pulse` (momentary
 * params, web → TD only). Phase 5 adds the WebRTC signaling messages —
 * `rtc-offer`, `rtc-answer`, `rtc-ice`, and `streams` — multiplexed over this
 * same socket. Phase 6.2 adds `menus`, the one deliberate piece of TD → web
 * introspection (see {@link MenusMessage}). Any *other* `type` is still dropped
 * by `parse` rather than mis-decoded, which is what keeps older clients
 * forward-compatible.
 *
 * See prds/TECH_PROPOSAL.md § "WebSocket Wire Format" for the full catalog.
 */

/** Bumped only on breaking wire changes (see § "Versioned handshake"). */
export const PROTOCOL_VERSION = 1

/**
 * A single parameter value on the wire. The wire speaks only clean JSON types —
 * TD does all coercion to/from its native par types (int/float, bool-as-0/1,
 * menu keys, ParGroups). `number[]` carries multi-component pars (color, XYZ).
 */
export type ParamValue = number | string | boolean | number[]

/** Map of friendly param name → value, as carried by `snapshot`/`update`. */
export type ParamMap = Record<string, ParamValue>

/**
 * Encode a browser-side multi-line string for a TD string parameter: real line
 * breaks become the two-character escape `\n`, which is how TouchDesigner's
 * string pars carry newlines (a Text TOP renders `\n` as a line break; a raw
 * newline in a par is not what TD expects). CR and CRLF are normalized to the
 * same escape, so a paste from Windows/legacy sources lands as one break.
 */
export function escapeNewlines(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Inverse of {@link escapeNewlines}, for showing a TD string in a `<textarea>`.
 *
 * Deliberately naive: it does not honour a backslash-escaped backslash, so text
 * whose *literal* content is `C:\name` comes back with a line break. Only params
 * a component explicitly marks multi-line go through this, and those hold prose,
 * not paths — handling the ambiguity would mean escaping backslashes on the way
 * out too, which TD itself would then show verbatim.
 */
export function unescapeNewlines(wire: string): string {
  return wire.replace(/\\n/g, '\n')
}

// ── web → TD ────────────────────────────────────────────────────────────────

/** Version handshake; opens every (re)connection. */
export interface HelloMessage {
  type: 'hello'
  protocol: number
}

/** Requests the current state of all exposed params (on connect/reconnect). */
export interface SnapshotRequestMessage {
  type: 'snapshot-request'
}

/**
 * App-level heartbeat (web → TD). Browser JS can't observe the WS protocol's
 * own ping/pong frames, so liveness of an *established* session is probed with
 * this explicit message; a missing `pong` marks the socket half-open.
 */
export interface PingMessage {
  type: 'ping'
}

/**
 * Asks TD to re-read and re-announce its menus (Phase 6.2). Answered with a
 * {@link MenusMessage}.
 *
 * Exists because menu *contents* changing has no TD-side event to broadcast
 * from — plugging in an audio interface leaves the par's value untouched and
 * only changes the set of legal values, which no Parameter Execute callback
 * reports. That leaves two ways to notice: TD polls, or the user says "look
 * again". This is the second, and it's the cheaper default — the person who
 * just plugged the device in is right there.
 *
 * Deliberately not folded into `snapshot-request`: refreshing a device list
 * shouldn't drag every parameter value along with it.
 */
export interface MenusRequestMessage {
  type: 'menus-request'
}

/**
 * Fires a momentary TD parameter (`par.pulse()`), web → TD only. Unlike
 * `update`, a pulse carries no value and holds no synced state — it's a
 * fire-and-forget event, excluded from snapshot/echo logic and throttle-exempt
 * (sent immediately; still subject to backpressure, see § "Outbound throttle").
 */
export interface PulseMessage {
  type: 'pulse'
  name: string
}

// ── both directions ───────────────────────────────────────────────────────

/**
 * A batch of param changes. Always carries a `params` map; a single change is a
 * one-entry map. Symmetric in both directions: the web sends edits, TD
 * broadcasts changes to all connected clients.
 */
export interface UpdateMessage {
  type: 'update'
  params: ParamMap
}

// ── WebRTC signaling, both directions (Phase 5.1) ──────────────────────────
//
// Signaling is multiplexed over this same WebSocket — one connection to manage,
// no second socket or extra TD component. Every signaling message is declared in
// *both* direction unions: `td-core` offers on connect/rebuild while TD offers
// on its own renegotiations (see `video.ts` § "Offer role"), so each side must be
// able to both send and receive an offer/answer without a wire-format change.

/** SDP offer. Sent by whichever side is initiating this negotiation. */
export interface RTCOfferMessage {
  type: 'rtc-offer'
  sdp: string
}

/** SDP answer, replying to an {@link RTCOfferMessage}. */
export interface RTCAnswerMessage {
  type: 'rtc-answer'
  sdp: string
}

/**
 * One trickled ICE candidate, carrying the full descriptor
 * `addIceCandidate()` needs — a bare candidate string can't be applied without
 * its m-line association.
 *
 * `candidate: null` is **end-of-candidates**: the receiver forwards it as
 * `addIceCandidate(null)`. This keeps trickle ICE symmetric in both directions
 * and independent of which side offered.
 */
export interface RTCIceMessage {
  type: 'rtc-ice'
  candidate: string | null
  sdpMid?: string | null
  sdpMLineIndex?: number | null
}

/** One announced video track: which `mid` on the peer carries which stream id. */
export interface StreamInfo {
  /** Stable, web-facing stream id — what `<Video stream="...">` selects on. */
  id: string
  /** The `mid` of the transceiver carrying this stream on the current peer. */
  mid: string
  /** Optional human-readable label for UI. */
  label?: string
}

/**
 * The `id` → `mid` map for every track on the peer. Re-sent on **every**
 * (re)negotiation, since a renegotiation can shift `mid`s — that's precisely why
 * the mapping is explicit rather than assuming a fixed track order.
 */
export interface StreamsMessage {
  type: 'streams'
  streams: StreamInfo[]
}

// ── TD → web ────────────────────────────────────────────────────────────────

/** Reply to `hello`: TD's protocol version plus optional instance metadata. */
export interface WelcomeMessage {
  type: 'welcome'
  protocol: number
  instance?: string
}

/** Reply to `snapshot-request`: an authoritative baseline of all params. */
export interface SnapshotMessage {
  type: 'snapshot'
  params: ParamMap
}

/** Reply to `ping`: proof the established session is still live. */
export interface PongMessage {
  type: 'pong'
}

/**
 * A surfaced-but-non-fatal error (TD → web). Routed to the connection's errors
 * signal / `onError`; it never tears down the socket. `ref` is present for
 * param-scoped errors (`unknown_param`, `param_not_writable`) so handlers can do
 * per-param recovery, and absent for connection-scoped errors.
 */
export interface ErrorMessage {
  type: 'error'
  code: string
  message?: string
  ref?: string
}

/** One choice in a TD-announced menu: the wire value plus its display label. */
export interface MenuOption {
  /** The menu **key** — exactly what `update` carries for this param. */
  value: string
  /** TD's human-readable label for that key. */
  label: string
}

/**
 * Menu options for menu-backed params, announced by TD (TD → web).
 *
 * This is the one place the "the web authors its own schema, TD is never
 * introspected" rule is deliberately broken, and it exists because some menus
 * **cannot** be authored in advance: an audio-device list depends on the machine
 * TD is running on and changes when hardware is plugged in. For those, keeping a
 * hand-written `options` array in sync isn't merely tedious, it's impossible.
 *
 * Kept a **separate message rather than folded into `snapshot`** (see the
 * proposal's § "Parameter modes"): `snapshot` stays a flat `{name: value}` map
 * in both directions, and menus can be re-announced on their own when a device
 * list changes without resending every value.
 *
 * Static, web-authored menus are unaffected — `<Select options={...}>` still
 * wins over anything announced here, so a project that announces nothing keeps
 * working exactly as before.
 */
export interface MenusMessage {
  type: 'menus'
  menus: Record<string, MenuOption[]>
}

/** Messages the web sends to TD. */
export type ClientMessage =
  | HelloMessage
  | SnapshotRequestMessage
  | MenusRequestMessage
  | UpdateMessage
  | PulseMessage
  | PingMessage
  | RTCOfferMessage
  | RTCAnswerMessage
  | RTCIceMessage
  | StreamsMessage

/** Messages the web receives from TD. */
export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | UpdateMessage
  | PongMessage
  | ErrorMessage
  | MenusMessage
  | RTCOfferMessage
  | RTCAnswerMessage
  | RTCIceMessage
  | StreamsMessage

/** Every known message in either direction. */
export type Message = ClientMessage | ServerMessage

/** The message `type`s `parse` will accept; anything else is dropped. */
const KNOWN_TYPES = new Set([
  'hello',
  'welcome',
  'snapshot-request',
  'snapshot',
  'menus-request',
  'update',
  'pulse',
  'ping',
  'pong',
  'error',
  'menus',
  'rtc-offer',
  'rtc-answer',
  'rtc-ice',
  'streams',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isParamMap(value: unknown): value is ParamMap {
  if (!isPlainObject(value)) return false
  for (const v of Object.values(value)) {
    const ok =
      typeof v === 'number' ||
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (Array.isArray(v) && v.every((n) => typeof n === 'number'))
    if (!ok) return false
  }
  return true
}

function isMenuMap(value: unknown): value is Record<string, MenuOption[]> {
  if (!isPlainObject(value)) return false
  for (const options of Object.values(value)) {
    if (!Array.isArray(options)) return false
    // Both fields are required: a menu entry with no label has nothing to render
    // in the dropdown, and one with no value can't be sent back as a menu key.
    const ok = options.every(
      (o) => isPlainObject(o) && typeof o.value === 'string' && typeof o.label === 'string',
    )
    if (!ok) return false
  }
  return true
}

function isStreamList(value: unknown): value is StreamInfo[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        isPlainObject(s) &&
        typeof s.id === 'string' &&
        typeof s.mid === 'string' &&
        (s.label === undefined || typeof s.label === 'string'),
    )
  )
}

/**
 * Parse a raw inbound WebSocket payload into a known {@link Message}.
 *
 * Returns `null` — rather than throwing — for malformed JSON, non-object
 * payloads, an unknown/missing `type`, or a structurally invalid known type.
 * The connection drops nulls and keeps processing the next message, so a single
 * bad frame never tears down the socket (see § "Error & malformed-message
 * handling").
 */
export function parse(raw: string): Message | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isPlainObject(data) || typeof data.type !== 'string') return null
  if (!KNOWN_TYPES.has(data.type)) return null

  switch (data.type) {
    case 'hello':
      return typeof data.protocol === 'number'
        ? { type: 'hello', protocol: data.protocol }
        : null
    case 'snapshot-request':
      return { type: 'snapshot-request' }
    case 'menus-request':
      return { type: 'menus-request' }
    case 'welcome':
      return typeof data.protocol === 'number'
        ? {
            type: 'welcome',
            protocol: data.protocol,
            ...(typeof data.instance === 'string' ? { instance: data.instance } : {}),
          }
        : null
    case 'snapshot':
      return isParamMap(data.params) ? { type: 'snapshot', params: data.params } : null
    case 'update':
      return isParamMap(data.params) ? { type: 'update', params: data.params } : null
    case 'pulse':
      return typeof data.name === 'string' ? { type: 'pulse', name: data.name } : null
    case 'ping':
      return { type: 'ping' }
    case 'pong':
      return { type: 'pong' }
    case 'rtc-offer':
      return typeof data.sdp === 'string' ? { type: 'rtc-offer', sdp: data.sdp } : null
    case 'rtc-answer':
      return typeof data.sdp === 'string' ? { type: 'rtc-answer', sdp: data.sdp } : null
    case 'rtc-ice': {
      // `null` is meaningful here (end-of-candidates), so `candidate` must be
      // present-and-null rather than merely absent, and the two m-line fields
      // keep an explicit `null` distinct from being omitted.
      if (!(typeof data.candidate === 'string' || data.candidate === null)) return null
      const mid = data.sdpMid
      const index = data.sdpMLineIndex
      if (mid !== undefined && mid !== null && typeof mid !== 'string') return null
      if (index !== undefined && index !== null && typeof index !== 'number') return null
      return {
        type: 'rtc-ice',
        candidate: data.candidate,
        ...(mid !== undefined ? { sdpMid: mid as string | null } : {}),
        ...(index !== undefined ? { sdpMLineIndex: index as number | null } : {}),
      }
    }
    case 'menus':
      return isMenuMap(data.menus) ? { type: 'menus', menus: data.menus } : null
    case 'streams':
      return isStreamList(data.streams) ? { type: 'streams', streams: data.streams } : null
    case 'error':
      return typeof data.code === 'string'
        ? {
            type: 'error',
            code: data.code,
            ...(typeof data.message === 'string' ? { message: data.message } : {}),
            ...(typeof data.ref === 'string' ? { ref: data.ref } : {}),
          }
        : null
    default:
      return null
  }
}
