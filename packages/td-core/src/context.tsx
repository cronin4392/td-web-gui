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
 * shared runtime context — the factory exists only to flow the generic into
 * JSX, which a bare `useContext` cannot do.
 *
 * `Calls`/`Handlers` are two more optional generics on `createTDClient`, typing
 * `call`/`notify` (what TD exposes) and `handle` (what the web exposes)
 * independently of the param `Schema`. `createTDHandler(name, fn)` is the
 * component-safe way to register a handler outside the bundle, unregistering on
 * cleanup.
 */

import { createContext, onCleanup, useContext, type JSX } from 'solid-js';
import {
  createTDConnection,
  type ParamSchema,
  type TDBinding,
  type TDConnection,
  type TDConnectionOptions,
} from './connection';
import { createTDVideoStream, type TDVideoStream, type TDVideoStreamOptions } from './video';
import type { JsonValue, ParamValue } from './wire';
import { Button, type ButtonProps } from './components/Button';
import { Color, type ColorProps } from './components/Color';
import { NumberInput, type NumberInputProps } from './components/NumberInput';
import { RangeInput, type RangeInputProps } from './components/RangeInput';
import { Select, type SelectProps } from './components/Select';
import { StreamToggle, type StreamToggleProps } from './components/StreamToggle';
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

/** One entry of a {@link CallSchema}: the argument and result shape of a named call. */
export interface CallSignature {
  args?: JsonValue;
  result?: JsonValue;
}

/**
 * A schema of named calls — what one side exposes for the other to invoke.
 * Written as a self-referential mapped type (see {@link ParamSchema}) rather
 * than `Record<string, CallSignature>`, so a plain `interface { print: {...} }`
 * declaration (which lacks an index signature) satisfies it.
 */
export type CallSchema<Schema> = { [K in keyof Schema]: CallSignature };

/**
 * Register a handler for a named `call`, unregistering on cleanup. A raw
 * `connection.handle()` inside a component leaks a handler on every remount.
 */
export function createTDHandler<
  Args extends JsonValue = JsonValue,
  Result extends JsonValue | undefined = JsonValue | undefined,
>(name: string, fn: (args: Args) => Result | Promise<Result> | void): void {
  // `Args` narrows a parameter, so the handler is contravariant in it and no
  // assignment from the wider `JsonValue | undefined` signature type-checks.
  const unregister = useTDConnection().handle(
    name,
    fn as unknown as (
      args: JsonValue | undefined,
    ) => JsonValue | undefined | Promise<JsonValue | undefined>,
  );
  onCleanup(unregister);
}

/** Props for the bundle's `<Provider>` member. */
export interface TDProviderProps {
  /** WebSocket URL of this TD instance's Web Server DAT. */
  url: string;
  /** Config `id` for this instance; authoritative over `welcome` metadata. */
  instance?: string;
  /**
   * Param names to declare read-only — authored beside the schema, e.g. an
   * expression-driven par. Bound controls render disabled and warn in dev.
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
 *
 * `Calls`/`Handlers` are optional and independent: `Calls` types what this
 * instance exposes for the web to invoke (`call`/`notify`); `Handlers` types
 * what the web exposes for TD to invoke (`handle`). Both default to a
 * permissive {@link CallSchema}, so every existing `createTDClient<Params>()`
 * call site keeps compiling unchanged.
 */
export function createTDClient<
  Schema extends ParamSchema<Schema>,
  Calls extends CallSchema<Calls> = Record<string, CallSignature>,
  Handlers extends CallSchema<Handlers> = Record<string, CallSignature>,
>() {
  // Solid context only resolves while an owner is set — true during render,
  // false inside a DOM event handler after paint. `pulse`/`call`/`notify`/
  // `handle` are meant to be called from event handlers, so they resolve
  // through the mounted providers rather than `useTDConnection()`.
  const mounted = new Set<TDConnection<Schema>>();

  function requireConnection(): TDConnection<Schema> {
    if (mounted.size === 1) return mounted.values().next().value!;
    if (mounted.size === 0) {
      throw new Error('[td-core] no TD connection — render this factory’s <Provider> first');
    }
    // "One factory per instance" (docs/api.md § createTDClient) is a real
    // invariant, not a convention: with two providers mounted there is no
    // owner to disambiguate from, so guessing would silently bind the wrong
    // socket. Use a second factory, or `useConnection()` during setup.
    throw new Error(
      `[td-core] ${mounted.size} <Provider>s mounted from one createTDClient — ` +
        'call `useConnection()` during setup instead, or use one factory per instance',
    );
  }

  function Provider(props: TDProviderProps): JSX.Element {
    // One connection per provider; auto-torn-down via the connection's own
    // onCleanup when this provider unmounts.
    const connection = createTDConnection<Schema>(props.url, {
      ...props.options,
      readonly: props.readonly ?? props.options?.readonly,
    });
    mounted.add(connection);
    onCleanup(() => mounted.delete(connection));
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

  function pulse(name: AnyKey<Schema>): void {
    requireConnection().pulse(name);
  }

  function call<K extends keyof Calls & string>(
    name: K,
    args?: Calls[K]['args'],
  ): Promise<Calls[K]['result']> {
    return requireConnection().call(name, args as JsonValue | undefined) as Promise<
      Calls[K]['result']
    >;
  }

  function notify<K extends keyof Calls & string>(name: K, args?: Calls[K]['args']): void {
    requireConnection().notify(name, args as JsonValue | undefined);
  }

  /**
   * Register a handler for a named `call` TD sends this way. Prefer
   * `createTDHandler` inside components — it self-unregisters on unmount; this
   * raw form is for code that manages its own lifecycle.
   */
  function handle<K extends keyof Handlers & string>(
    name: K,
    fn: (args: Handlers[K]['args']) => Handlers[K]['result'] | Promise<Handlers[K]['result']>,
  ): () => void {
    return requireConnection().handle(
      name,
      fn as (args: JsonValue | undefined) => JsonValue | undefined | Promise<JsonValue | undefined>,
    );
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
    call,
    notify,
    handle,
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
    // Not schema-typed: both select on a stream id TD announces at runtime,
    // which isn't part of the param schema.
    Video: (props: VideoProps): JSX.Element => Video(props),
    StreamToggle: (props: StreamToggleProps): JSX.Element => StreamToggle(props),
  };
}
