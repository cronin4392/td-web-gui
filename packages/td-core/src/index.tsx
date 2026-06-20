/**
 * td-core — reusable Solid.js library for talking to TouchDesigner.
 *
 * Phase 2 public surface: the wire format, the standalone connection manager,
 * the schema-bound factory/context layer, and the bound components
 * (`TextInput`, `NumberInput`, `RangeInput`, `Value`). The factory (`createTDClient`) is the
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
  type HelloMessage,
  type Message,
  type ParamMap,
  type ParamValue,
  type ServerMessage,
  type SnapshotMessage,
  type SnapshotRequestMessage,
  type UpdateMessage,
  type WelcomeMessage,
} from './wire'

// Connection primitive
export {
  createTDConnection,
  type TDBinding,
  type TDConnection,
  type TDConnectionOptions,
  type TDStatus,
} from './connection'

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
