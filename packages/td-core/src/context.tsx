/**
 * Factory + context layer.
 *
 * `createTDClient<Schema>()` returns a schema-bound bundle — a typed `Provider`,
 * the control/display components, and the `signal` helper — all generic over
 * that instance's param map, so parameter `name`s autocomplete and typos are
 * compile errors *inside JSX*.
 *
 * There is a single module-level context holding the active connection, and a
 * second one holding that provider's WebRTC peer when `<Provider video>` opts
 * into video. `<Provider>` owns one connection (and at most one peer)
 * and shares them via those contexts;
 * `createTDSignal(name)` binds to the nearest provider's connection. The
 * per-factory generic typing is a purely compile-time wrapper over this one
 * shared runtime context (see § "Type safety" in the proposal for why the
 * factory is needed to flow the generic into JSX).
 */

import { createContext, useContext, type JSX } from 'solid-js';
import {
  createTDConnection,
  type ParamSchema,
  type TDBinding,
  type TDConnection,
  type TDConnectionOptions,
} from './connection';
import { createTDVideoStream, type TDVideoStream, type TDVideoStreamOptions } from './video';
import type { ParamValue } from './wire';
import { Button, type ButtonProps } from './components/Button';
import { Color, type ColorProps } from './components/Color';
import { NumberInput, type NumberInputProps } from './components/NumberInput';
import { RangeInput, type RangeInputProps } from './components/RangeInput';
import { Select, type SelectProps } from './components/Select';
import { Table, type TableProps } from './components/Table';
import { TextInput, type TextInputProps } from './components/TextInput';
import { Toggle, type ToggleProps } from './components/Toggle';
import { Value, type ValueProps } from './components/Value';
import { Vector, type VectorProps } from './components/Vector';
import { Video, type VideoProps } from './components/Video';

/** Shared runtime context: the nearest provider's connection. */
const TDContext = createContext<TDConnection>();

/**
 * Shared runtime context: the nearest provider's WebRTC peer, when that
 * provider opted into video. Separate from {@link TDContext} because video is
 * opt-in — a provider with no `video` prop opens no peer at all, which matters
 * when up to 8 instances are live.
 */
const TDVideoContext = createContext<TDVideoStream>();

/** Read the nearest provider's connection, or throw if used outside one. */
export function useTDConnection(): TDConnection {
  const connection = useContext(TDContext);
  if (!connection) {
    throw new Error('[td-core] no TD connection in context — wrap this component in a <Provider>');
  }
  return connection;
}

/** Read the nearest provider's video peer, or throw if video wasn't enabled. */
export function useTDVideoStream(): TDVideoStream {
  const video = useContext(TDVideoContext);
  if (!video) {
    throw new Error('[td-core] no TD video peer in context — pass `video` to the <Provider>');
  }
  return video;
}

/**
 * Bind a Solid signal to a named TD parameter on the nearest provider's
 * connection. Public for custom components; the bundled controls use it
 * internally. Generic `T` is supplied by the factory's typed wrappers.
 */
export function createTDSignal<T extends ParamValue = ParamValue>(name: string): TDBinding<T> {
  return useTDConnection().signal(name) as unknown as TDBinding<T>;
}

/** Props for the bundle's `<Provider>` member. */
export interface TDProviderProps {
  /** WebSocket URL of this TD instance's Web Server DAT. */
  url: string;
  /** Config `id` for this instance; authoritative over `welcome` metadata. */
  instance?: string;
  /**
   * Param names to declare read-only — authored beside the
   * schema, e.g. an expression-driven par. Bound controls render disabled and
   * warn in dev; never sent over the wire (see § "Parameter modes").
   */
  readonly?: string[];
  /** Per-connection options forwarded to {@link createTDConnection}. */
  options?: TDConnectionOptions;
  /**
   * Open a WebRTC peer for this instance, multiplexing its signaling
   * over the same socket. Opt-in: without it no `RTCPeerConnection` is created,
   * and `<Video>` throws. Pass an object to tune the peer.
   */
  video?: boolean | Omit<TDVideoStreamOptions, 'connection'>;
  children?: JSX.Element;
}

/** Keys of `Schema` whose value type is assignable to `T`. */
type KeysOfType<Schema, T> = {
  [K in keyof Schema]: Schema[K] extends T ? K : never;
}[keyof Schema] &
  string;

/** Every key of `Schema`, as a string (e.g. for read-only `<Value>`). */
type AnyKey<Schema> = keyof Schema & string;

/**
 * Create a schema-bound bundle for one TD instance. One factory per instance;
 * schemas are heterogeneous.
 */
export function createTDClient<Schema extends ParamSchema<Schema>>() {
  function Provider(props: TDProviderProps): JSX.Element {
    // One connection per provider; auto-torn-down via the connection's own
    // onCleanup when this provider unmounts.
    const connection = createTDConnection<Schema>(props.url, {
      ...props.options,
      readonly: props.readonly ?? props.options?.readonly,
    });
    // Read once at setup, like `url`: swapping video on/off mid-life would mean
    // tearing a peer down, which is what unmounting the provider already does.
    const video = props.video
      ? createTDVideoStream({
          ...(typeof props.video === 'object' ? props.video : {}),
          connection: connection as unknown as TDConnection,
        })
      : undefined;
    return (
      <TDContext.Provider value={connection as unknown as TDConnection}>
        <TDVideoContext.Provider value={video}>{props.children}</TDVideoContext.Provider>
      </TDContext.Provider>
    );
  }

  function signal<K extends AnyKey<Schema>>(name: K): TDBinding<Schema[K]> {
    return createTDSignal<Schema[K]>(name);
  }

  /** Fire a momentary parameter on the nearest provider's connection. */
  function pulse(name: AnyKey<Schema>): void {
    useTDConnection().pulse(name);
  }

  // Typed wrappers: restrict `name` to the keys whose wire-type matches each
  // control. The underlying components are untyped (string name) and bind via
  // the shared context, so the wrappers add only compile-time safety.
  const TypedTextInput = (
    props: TextInputProps & { name: KeysOfType<Schema, string> },
  ): JSX.Element => TextInput(props);

  const TypedNumberInput = (
    props: NumberInputProps & { name: KeysOfType<Schema, number> },
  ): JSX.Element => NumberInput(props);

  const TypedRangeInput = (
    props: RangeInputProps & { name: KeysOfType<Schema, number> },
  ): JSX.Element => RangeInput(props);

  const TypedValue = (props: ValueProps & { name: AnyKey<Schema> }): JSX.Element => Value(props);

  const TypedToggle = (props: ToggleProps & { name: KeysOfType<Schema, boolean> }): JSX.Element =>
    Toggle(props);

  // `name` isn't narrowed to a boolean-valued key: `mode="pulse"` binds a
  // momentary param that isn't part of the synced value schema at all, so
  // `Button` accepts any schema key regardless of mode (same stance as
  // `<Value>`, which also works across every value type).
  const TypedButton = (props: ButtonProps & { name: AnyKey<Schema> }): JSX.Element => Button(props);

  const TypedSelect = (props: SelectProps & { name: KeysOfType<Schema, string> }): JSX.Element =>
    Select(props);

  const TypedVector = (props: VectorProps & { name: KeysOfType<Schema, number[]> }): JSX.Element =>
    Vector(props);

  const TypedColor = (props: ColorProps & { name: KeysOfType<Schema, number[]> }): JSX.Element =>
    Color(props);

  // Narrowed to `string[][]` keys, which are readouts by construction — no TD
  // parameter carries a table, so there is nothing writable to confuse this with.
  const TypedTable = (props: TableProps & { name: KeysOfType<Schema, string[][]> }): JSX.Element =>
    Table(props);

  return {
    Provider,
    signal,
    pulse,
    useConnection: useTDConnection,
    useVideo: useTDVideoStream,
    TextInput: TypedTextInput,
    NumberInput: TypedNumberInput,
    RangeInput: TypedRangeInput,
    Value: TypedValue,
    Toggle: TypedToggle,
    Button: TypedButton,
    Select: TypedSelect,
    Vector: TypedVector,
    Color: TypedColor,
    Table: TypedTable,
    // Not schema-typed: `<Video>` selects on a stream id TD announces at
    // runtime, which isn't part of the param schema.
    Video: (props: VideoProps): JSX.Element => Video(props),
  };
}
