/**
 * TD instance configuration for the example app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * This app drives **two** TouchDesigner processes at once (Phase 6.6): two
 * `.toe` files on two ports, each with its own schema, its own connection, and
 * its own WebRTC peer. Everything below is therefore paired — one descriptor,
 * one schema, and one read-only set per instance — and `App.tsx` builds one
 * `createTDClient<Schema>()` factory from each pair.
 *
 * The two schemas are deliberately **not** the same shape. See
 * `td/Example2/config.py` for why: an instance's wire names are its own
 * vocabulary, so `label` here and `message` there can be the same TD parameter
 * in two projects, and typing one instance's name into the other's column is a
 * compile error rather than a silently dropped `update`.
 */

import type { JsonValue } from 'td-core';

/** Static `{ id, url }` descriptor for one TD instance's Web Server DAT. */
export interface TDInstanceConfig {
  id: string;
  url: string;
}

const host = import.meta.env.VITE_TD_HOST ?? 'localhost';

/**
 * One port per instance. Separate variables rather than a base + offset: the
 * ports are whatever each `.toe`'s WebGuiServer `Port` par says, and nothing
 * makes them contiguous.
 */
const port1 = import.meta.env.VITE_TD_PORT_1 ?? '9980';
const port2 = import.meta.env.VITE_TD_PORT_2 ?? '9981';

/**
 * The two instances, in column order. `id` matches each project's WebGuiServer
 * `Identifier` par — the `welcome` message carries that back, and the provider
 * treats the config value as authoritative when they disagree.
 */
export const instances = [
  { id: 'example1', url: `ws://${host}:${port1}` },
  { id: 'example2', url: `ws://${host}:${port2}` },
] as const satisfies readonly TDInstanceConfig[];

/**
 * How many video tiles each wall is built for — four per instance, eight in
 * total across the page. That is the same encoder load as Phase 6.7's
 * single-instance wall of eight, split over two peers instead of one.
 *
 * Kept web-side because it sets `receivers`, the number of recvonly m-lines our
 * SDP offer carries, and that has to be decided *before* TD answers: an answerer
 * can't add m-lines, so anything TD announces beyond this count has nowhere to
 * go. It must therefore be >= each TD project's `STREAM_COUNT`
 * (`td/Example1/config.py` and `td/Example2/config.py`), which is the one number
 * the two sides must agree on — the ids themselves are discovered at runtime
 * from the `streams` message.
 *
 * One constant rather than one per instance because both walls are four; a page
 * mixing wall sizes would pass a different `receivers` per `<Provider>`, which
 * the library supports.
 */
export const VIDEO_TILES = 4;

/**
 * Param schema for instance 1 (`td/Example1/config.py`) — the kitchen sink, one
 * param per bound control kind.
 */
export interface Example1Params {
  message: string;
  intensity: number;
  enabled: boolean;
  reset: boolean;
  gate: boolean;
  mute: boolean;
  blendmode: string;
  position: number[];
  color: number[];
  /**
   * Audio input device. Typed as a plain `string` like `blendmode`
   * — the difference is entirely in where the *options* come from. `blendmode`'s
   * are hardcoded in `App.tsx`; these can't be, because the keys are
   * machine-specific device GUIDs that change when hardware is plugged in. TD
   * announces them over the `menus` message instead.
   */
  audiodevice: string;

  // Readouts (TD → web only) — `READOUTS` entries in td/Example1/config.py. They
  // share the parameter namespace, so they belong in this same interface.
  fps: number;
  cooking: boolean;
  bands: number[];
  track: string;
  cues: string[][];
}

/** Readout names on instance 1, declared read-only so their controls render disabled. */
export const example1Readonly = [
  'fps',
  'cooking',
  'bands',
  'track',
  'cues',
] as const satisfies readonly (keyof Example1Params)[];

/**
 * Calls instance 1 exposes for the web to invoke (`td/Example1/config.py`'s
 * `HANDLERS`) — what `Example1.call`/`Example1.notify` may name.
 */
export interface Example1Calls {
  print: { args: { text: string }; result: { ok: boolean } };
  echo: { args: JsonValue; result: { echo: JsonValue; frame: number } };
}

/**
 * Calls the web exposes for instance 1 to invoke (`Example1.handle`/
 * `createTDHandler`) — what `parent.WebGuiServer.Notify`/`.Call` may name from
 * TD's side.
 */
export interface Example1Handlers {
  alert: { args: { text: string } };
}

/**
 * Param schema for instance 2 (`td/Example2/config.py`) — a second machine doing
 * a smaller, different job. Different names for the same kinds of thing, and a
 * strict subset of the kinds: no menu, no table, no multi-component control par
 * beyond the colour.
 */
export interface Example2Params {
  label: string;
  opacity: number;
  playing: boolean;
  restart: boolean;
  tint: number[];

  // Readouts (TD → web only) — `READOUTS` in td/Example2/config.py.
  fps: number;
  levels: number[];
}

/**
 * Read-only names on instance 2 — the two readouts, plus `opacity`.
 *
 * `opacity` is the interesting one: it is an ordinary writable-looking number
 * par that TD's registry flags `writable: False`. That flag never crosses the
 * wire, so this list is the only reason the control renders disabled. Remove
 * `opacity` from it and the slider goes live, sends, and comes back refused with
 * a `param_not_writable` error that re-snapshots the optimistic edit away —
 * which is the runtime backstop working, and the reason the web-side list is a
 * convenience rather than the enforcement.
 */
export const example2Readonly = [
  'opacity',
  'fps',
  'levels',
] as const satisfies readonly (keyof Example2Params)[];
