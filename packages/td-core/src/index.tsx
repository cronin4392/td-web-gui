/**
 * td-core — Solid.js library for building web UIs that control TouchDesigner.
 *
 * The public surface, in the order most apps meet it:
 *
 *  - **`createTDClient<Schema>()`** — the intended path for app UI. Returns a
 *    schema-bound bundle (typed `Provider`, controls, and `signal` helper) so
 *    parameter names autocomplete and typos are compile errors inside JSX.
 *  - **Bound components** — `TextInput`, `NumberInput`, `RangeInput`, `Value`,
 *    `Toggle`, `Button`, `Select`, `Vector`, `Color`, `Table`, `Video`,
 *    `StreamToggle`. Exported unbound here for use without the schema typing;
 *    both forms are the same component.
 *  - **`createTDConnection(url)`** — the connection manager the provider wraps.
 *    Handshake, reconnect/backoff, handshake watchdog, ping/pong heartbeat,
 *    outbound throttle, backpressure, read-only params, error routing, and
 *    named calls (`call`/`notify`/`handle`), all as per-connection options.
 *    Usable standalone with zero context.
 *  - **`createTDVideoStream(config)`** — the WebRTC peer, whose signaling is
 *    multiplexed over that same socket.
 *  - **The wire format** — message types plus `parse`, for code that handles
 *    raw messages through `connection.subscribe()`.
 *
 * See docs/api.md for the full reference and docs/protocol.md for the wire
 * contract.
 */

/**
 * Library version. Distinct from `PROTOCOL_VERSION`, which only changes on a
 * breaking wire change (see ./wire).
 */
export const version = '0.1.0';

// Wire format
export {
  PROTOCOL_VERSION,
  escapeNewlines,
  isServerMessage,
  parse,
  unescapeNewlines,
  type CallMessage,
  type CallResultMessage,
  type ClientMessage,
  type ErrorMessage,
  type HelloMessage,
  type JsonValue,
  type MenuOption,
  type MenusMessage,
  type MenusRequestMessage,
  type Message,
  type ParamMap,
  type ParamValue,
  type PingMessage,
  type PongMessage,
  type PulseMessage,
  type RTCAnswerMessage,
  type RTCIceMessage,
  type RTCOfferMessage,
  type ServerMessage,
  type SnapshotMessage,
  type SnapshotRequestMessage,
  type StreamEnableMessage,
  type StreamInfo,
  type StreamsMessage,
  type StreamStateMessage,
  type UpdateMessage,
  type WelcomeMessage,
} from './wire';

// Connection primitive
export {
  createTDConnection,
  type BackoffOptions,
  type BackpressureOptions,
  type HeartbeatOptions,
  type ParamSchema,
  type TDConnection,
  type TDConnectionOptions,
  type TDStatus,
  type WebSocketLike,
  type WebSocketLikeConstructor,
} from './connection';

// Parameter bindings
export { type TDBinding, type TDSendOptions } from './params';

// Scheduler (injectable clock; default backed by the platform globals)
export { defaultScheduler, type TDScheduler } from './scheduler';

// Calls (named-handler invocation, both directions)
export { TDCallError, type CallHandler, type CallOptions } from './calls';

// WebRTC peer
export {
  createTDVideoStream,
  type IceCandidateInit,
  type MediaStreamLike,
  type MediaStreamLikeConstructor,
  type RTCPeerConnectionLike,
  type RTCPeerConnectionLikeConstructor,
  type TDPeerStatus,
  type TDStreamStatus,
  type TDVideoStream,
  type TDVideoStreamOptions,
} from './video';

// Factory + context
export {
  createTDClient,
  createTDHandler,
  createTDSignal,
  useTDConnection,
  useTDVideoStream,
  type CallSchema,
  type CallSignature,
  type TDProviderProps,
} from './context';

// Components
export { Button, type ButtonProps } from './components/Button';
export { Color, type ColorProps } from './components/Color';
export { NumberInput, type NumberInputProps } from './components/NumberInput';
export { RangeInput, type RangeInputProps } from './components/RangeInput';
export { Select, type SelectOption, type SelectProps } from './components/Select';
export { StreamToggle, type StreamToggleProps } from './components/StreamToggle';
export { Table, type TableProps } from './components/Table';
export { TextInput, type TextInputProps } from './components/TextInput';
export { Toggle, type ToggleProps } from './components/Toggle';
export { Value, type ValueProps } from './components/Value';
export { Vector, type VectorProps } from './components/Vector';
export { Video, type VideoProps } from './components/Video';
