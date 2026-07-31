/**
 * The parameter registry: named bindings, echo suppression, read-only marking,
 * and TD-announced menus.
 *
 * Knows nothing about `WebSocket`, reconnects, or throttling — `connection.ts`
 * hands it a `send` that already applies those. That split is what lets the
 * editor-count and optimistic-write rules be exercised without a socket.
 */

import { batch, createSignal, getOwner, onCleanup, type Accessor } from 'solid-js';
import type { MenuOption, ParamMap, ParamValue } from './wire';

/** Options for the per-write send path (see {@link TDBinding.setValue}). */
export interface TDSendOptions {
  /**
   * Coalesce this send with any other throttled writes in the same animation
   * frame into a single `update` message. The optimistic local write still
   * happens immediately; only the wire send is deferred to the frame boundary.
   * Defaults to `false` (send immediately).
   */
  throttle?: boolean;
}

/**
 * A live binding to one named TD parameter. Returned by `connection.signal()`
 * and (via context) by `createTDSignal`. Multiple binders of the same name
 * share one underlying signal, so optimistic writes fan out to all of them.
 */
export interface TDBinding<T extends ParamValue = ParamValue> {
  /** Reactive accessor for the current value (`undefined` until first synced). */
  value: Accessor<T | undefined>;
  /** Optimistic local write: updates the shared signal *and* sends an `update`. */
  setValue: (value: T, options?: TDSendOptions) => void;
  /** Mark this binder as actively editing (focus / drag-start). */
  beginEdit: () => void;
  /** Release the active-editing mark (blur / drag-end). */
  endEdit: () => void;
  /**
   * Reactive: whether this name is currently read-only — either statically
   * declared via `<Provider readonly>`, or marked so at runtime by an inbound
   * `param_not_writable` error. Bound controls disable on this.
   */
  readonly: Accessor<boolean>;
}

/** Per-name routing entry: the shared signal plus its active-editor count. */
interface SignalEntry {
  read: Accessor<ParamValue | undefined>;
  write: (value: ParamValue | undefined) => void;
  editors: number;
}

export interface ParamRegistryOptions {
  /** Send one or more param edits. Throttling and guards are the caller's. */
  send: (params: ParamMap, options?: TDSendOptions) => void;
  /** Names to declare read-only up front. */
  readonly?: Iterable<string>;
}

export interface ParamRegistry {
  signal: <T extends ParamValue>(name: string) => TDBinding<T>;
  /** Apply an inbound `params` map, respecting echo suppression. */
  apply: (params: ParamMap) => void;
  isReadonly: (name: string) => boolean;
  markReadonly: (name: string) => void;
  menuOptions: (name: string) => MenuOption[] | undefined;
  setMenus: (menus: Record<string, MenuOption[]>) => void;
  /** Drop every binding and announced menu (connection teardown). */
  clear: () => void;
}

export function createParamRegistry(options: ParamRegistryOptions): ParamRegistry {
  const [readonlyNames, setReadonlyNames] = createSignal<ReadonlySet<string>>(
    new Set(options.readonly ?? []),
  );
  const [menus, setMenus] = createSignal<Record<string, MenuOption[]>>({});
  const entries = new Map<string, SignalEntry>();

  function isReadonly(name: string): boolean {
    return readonlyNames().has(name);
  }

  function markReadonly(name: string) {
    setReadonlyNames((prev) => {
      if (prev.has(name)) return prev;
      return new Set(prev).add(name);
    });
  }

  function entryFor(name: string): SignalEntry {
    let entry = entries.get(name);
    if (!entry) {
      const [read, setRaw] = createSignal<ParamValue | undefined>(undefined);
      entry = {
        read,
        // Wrap in a thunk so array values are never mistaken for Solid updaters.
        write: (value) => setRaw(() => value),
        editors: 0,
      };
      entries.set(name, entry);
    }
    return entry;
  }

  function apply(params: ParamMap) {
    // One reactive flush per message regardless of how many params it carries.
    batch(() => {
      for (const name of Object.keys(params)) {
        const entry = entries.get(name);
        if (!entry) continue; // unbound name → map miss, dropped (no allocation)
        if (entry.editors > 0) continue; // local edit wins while focused/dragging
        entry.write(params[name]);
      }
    });
  }

  function signal<T extends ParamValue>(name: string): TDBinding<T> {
    const entry = entryFor(name);

    if (isReadonly(name)) {
      console.warn(`[td-core] "${name}" is bound to a read-only param — control disabled`);
    }

    // Counted, not a boolean, because one binding can back several inputs
    // (`<Vector>`'s components, `<Color>`'s rgb + alpha) whose focus/blur pairs
    // overlap. Tracked per-binding so cleanup can release exactly what THIS
    // binding still holds: a control unmounted while focused fires no `blur`,
    // and a leaked count suppresses TD updates for that name permanently — for
    // every other binder of it too.
    let held = 0;
    const release = () => {
      entry.editors -= held;
      held = 0;
    };
    if (getOwner()) onCleanup(release);

    return {
      value: entry.read as Accessor<T | undefined>,
      setValue: (value, sendOptions) => {
        entry.write(value); // optimistic: UI updates before any TD echo
        options.send({ [name]: value }, sendOptions);
      },
      beginEdit: () => {
        held++;
        entry.editors++;
      },
      endEdit: () => {
        if (held === 0) return;
        held--;
        entry.editors--;
      },
      readonly: () => isReadonly(name),
    };
  }

  return {
    signal,
    apply,
    isReadonly,
    markReadonly,
    menuOptions: (name) => menus()[name],
    setMenus,
    clear: () => {
      entries.clear();
      setMenus({});
    },
  };
}
