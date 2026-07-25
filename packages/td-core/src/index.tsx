/**
 * td-core — reusable Solid.js library for talking to TouchDesigner.
 *
 * Public surface: the wire format, the standalone connection manager (Phase 3
 * adds reconnect/backoff, handshake watchdog, ping/pong heartbeat, outbound
 * throttle, backpressure, and error routing; Phase 4 adds `pulse` and
 * read-only params — all per-connection options; Phase 5 adds the WebRTC peer,
 * whose signaling is multiplexed over the same socket), the schema-bound
 * factory/context layer, and the bound components (`TextInput`, `NumberInput`,
 * `RangeInput`, `Value`, `Toggle`, `Button`, `Select`, `Vector`, `Color`,
 * `Video`). The factory (`createTDClient`) is the intended path for app UI; the
 * connection/signal primitives stay public for non-component or advanced use.
 */

/** Library version marker. */
export const version = '0.0.0'

// Wire format
export {
  PROTOCOL_VERSION,
  escapeNewlines,
  parse,
  unescapeNewlines,
  type ClientMessage,
  type ErrorMessage,
  type HelloMessage,
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
  type StreamInfo,
  type StreamsMessage,
  type UpdateMessage,
  type WelcomeMessage,
} from './wire'

// Connection primitive
export {
  createTDConnection,
  type BackoffOptions,
  type BackpressureOptions,
  type HeartbeatOptions,
  type TDBinding,
  type TDConnection,
  type TDConnectionOptions,
  type TDSendOptions,
  type TDStatus,
} from './connection'

// Scheduler (injectable clock; default backed by the platform globals)
export { defaultScheduler, type TDScheduler } from './scheduler'

// WebRTC peer (Phase 5)
export {
  createTDVideoStream,
  type IceCandidateInit,
  type MediaStreamLike,
  type RTCPeerConnectionLike,
  type RTCPeerConnectionLikeConstructor,
  type TDPeerStatus,
  type TDVideoStream,
  type TDVideoStreamOptions,
} from './video'

// Factory + context
export {
  createTDClient,
  createTDSignal,
  useTDConnection,
  useTDVideoStream,
  type TDProviderProps,
} from './context'

// Components
export { Button, type ButtonProps } from './components/Button'
export { Color, type ColorProps } from './components/Color'
export { NumberInput, type NumberInputProps } from './components/NumberInput'
export { RangeInput, type RangeInputProps } from './components/RangeInput'
export { Select, type SelectOption, type SelectProps } from './components/Select'
export { TextInput, type TextInputProps } from './components/TextInput'
export { Toggle, type ToggleProps } from './components/Toggle'
export { Value, type ValueProps } from './components/Value'
export { Vector, type VectorProps } from './components/Vector'
export { Video, type VideoProps } from './components/Video'
