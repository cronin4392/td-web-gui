/**
 * Factory + context layer (Phase 2.3).
 *
 * `createTDClient<Schema>()` returns a schema-bound bundle — a typed `Provider`,
 * the control/display components, and the `signal` helper — all generic over
 * that instance's param map, so parameter `name`s autocomplete and typos are
 * compile errors *inside JSX*.
 *
 * There is a single module-level context holding the active connection.
 * `<Provider>` owns one connection and shares it via that context;
 * `createTDSignal(name)` binds to the nearest provider's connection. The
 * per-factory generic typing is a purely compile-time wrapper over this one
 * shared runtime context (see § "Type safety" in the proposal for why the
 * factory is needed to flow the generic into JSX).
 */

import {
  createContext,
  useContext,
  type JSX,
} from 'solid-js'
import {
  createTDConnection,
  type ParamSchema,
  type TDBinding,
  type TDConnection,
  type TDConnectionOptions,
} from './connection'
import type { ParamValue } from './wire'
import { NumberInput, type NumberInputProps } from './components/NumberInput'
import { RangeInput, type RangeInputProps } from './components/RangeInput'
import { TextInput, type TextInputProps } from './components/TextInput'
import { Value, type ValueProps } from './components/Value'

/** Shared runtime context: the nearest provider's connection. */
const TDContext = createContext<TDConnection>()

/** Read the nearest provider's connection, or throw if used outside one. */
export function useTDConnection(): TDConnection {
  const connection = useContext(TDContext)
  if (!connection) {
    throw new Error(
      '[td-core] no TD connection in context — wrap this component in a <Provider>',
    )
  }
  return connection
}

/**
 * Bind a Solid signal to a named TD parameter on the nearest provider's
 * connection. Public for custom components; the bundled controls use it
 * internally. Generic `T` is supplied by the factory's typed wrappers.
 */
export function createTDSignal<T extends ParamValue = ParamValue>(
  name: string,
): TDBinding<T> {
  return useTDConnection().signal(name) as unknown as TDBinding<T>
}

/** Props for the bundle's `<Provider>` member. */
export interface TDProviderProps {
  /** WebSocket URL of this TD instance's Web Server DAT. */
  url: string
  /** Config `id` for this instance; authoritative over `welcome` metadata. */
  instance?: string
  /** Per-connection options forwarded to {@link createTDConnection}. */
  options?: TDConnectionOptions
  children?: JSX.Element
}

/** Keys of `Schema` whose value type is assignable to `T`. */
type KeysOfType<Schema, T> = {
  [K in keyof Schema]: Schema[K] extends T ? K : never
}[keyof Schema] &
  string

/** Every key of `Schema`, as a string (e.g. for read-only `<Value>`). */
type AnyKey<Schema> = keyof Schema & string

/**
 * Create a schema-bound bundle for one TD instance. One factory per instance;
 * schemas are heterogeneous.
 */
export function createTDClient<Schema extends ParamSchema<Schema>>() {
  function Provider(props: TDProviderProps): JSX.Element {
    // One connection per provider; auto-torn-down via the connection's own
    // onCleanup when this provider unmounts.
    const connection = createTDConnection<Schema>(props.url, props.options)
    return (
      <TDContext.Provider value={connection as unknown as TDConnection}>
        {props.children}
      </TDContext.Provider>
    )
  }

  function signal<K extends AnyKey<Schema>>(name: K): TDBinding<Schema[K]> {
    return createTDSignal<Schema[K]>(name)
  }

  // Typed wrappers: restrict `name` to the keys whose wire-type matches each
  // control. The underlying components are untyped (string name) and bind via
  // the shared context, so the wrappers add only compile-time safety.
  const TypedTextInput = (
    props: TextInputProps & { name: KeysOfType<Schema, string> },
  ): JSX.Element => TextInput(props)

  const TypedNumberInput = (
    props: NumberInputProps & { name: KeysOfType<Schema, number> },
  ): JSX.Element => NumberInput(props)

  const TypedRangeInput = (
    props: RangeInputProps & { name: KeysOfType<Schema, number> },
  ): JSX.Element => RangeInput(props)

  const TypedValue = (
    props: ValueProps & { name: AnyKey<Schema> },
  ): JSX.Element => Value(props)

  return {
    Provider,
    signal,
    useConnection: useTDConnection,
    TextInput: TypedTextInput,
    NumberInput: TypedNumberInput,
    RangeInput: TypedRangeInput,
    Value: TypedValue,
  }
}
