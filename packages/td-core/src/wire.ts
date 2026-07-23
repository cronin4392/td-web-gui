/**
 * Wire format — the typed JSON discriminated-union envelope spoken over the
 * WebSocket between the web UI and TouchDesigner.
 *
 * Phase 2 covered the control-data subset: `hello`, `welcome`,
 * `snapshot-request`, `snapshot`, and `update`. Phase 3 (WebSocket hardening)
 * adds the connection-liveness and error messages — `ping`/`pong` (app-level
 * heartbeat) and `error` (surfaced, non-fatal). Pulse and the WebRTC signaling
 * messages still arrive in later phases — `parse` drops those (and any future)
 * `type`s rather than mis-decoding them until then.
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

/** Messages the web sends to TD. */
export type ClientMessage =
  | HelloMessage
  | SnapshotRequestMessage
  | UpdateMessage
  | PingMessage

/** Messages the web receives from TD. */
export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | UpdateMessage
  | PongMessage
  | ErrorMessage

/** Every known message in either direction. */
export type Message = ClientMessage | ServerMessage

/** The message `type`s `parse` will accept; anything else is dropped. */
const KNOWN_TYPES = new Set([
  'hello',
  'welcome',
  'snapshot-request',
  'snapshot',
  'update',
  'ping',
  'pong',
  'error',
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
    case 'ping':
      return { type: 'ping' }
    case 'pong':
      return { type: 'pong' }
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
