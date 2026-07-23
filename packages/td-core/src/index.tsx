/**
 * td-core — reusable Solid.js library for talking to TouchDesigner.
 *
 * Public surface: the wire format, the standalone connection manager (Phase 3
 * adds reconnect/backoff, handshake watchdog, ping/pong heartbeat, outbound
 * throttle, backpressure, and error routing — all per-connection options), the
 * schema-bound factory/context layer, and the bound components (`TextInput`,
 * `NumberInput`, `RangeInput`, `Value`). The factory (`createTDClient`) is the
 * intended path for app UI; the connection/signal primitives stay public for
 * non-component or advanced use.
 */

/** Library version marker. */
export const version = '0.0.0'

// Wire format
export {
  PROTOCOL_VERSION,
  parse,
  type ClientMessage,
  type ErrorMessage,
  type HelloMessage,
  type Message,
  type ParamMap,
  type ParamValue,
  type PingMessage,
  type PongMessage,
  type ServerMessage,
  type SnapshotMessage,
  type SnapshotRequestMessage,
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

// Factory + context
export {
  createTDClient,
  createTDSignal,
  useTDConnection,
  type TDProviderProps,
} from './context'

// Components
export { NumberInput, type NumberInputProps } from './components/NumberInput'
export { RangeInput, type RangeInputProps } from './components/RangeInput'
export { TextInput, type TextInputProps } from './components/TextInput'
export { Value, type ValueProps } from './components/Value'
