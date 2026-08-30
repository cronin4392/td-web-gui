/**
 * TD instance configuration for the vj-gui app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * The page drives **fourteen** TouchDesigner processes, of **three** kinds:
 *
 *   - the GUI project (`td/gui-config.py`), which owns the Color schemes and
 *     the beat period — one of a kind, one schema; which loader is active is
 *     this app's own state (`selectedLayer` in `PlaybackProvider`), which TD's
 *     MIDI select button nudges by calling `selectLayer` rather than by
 *     holding it;
 *   - the scene projects (`td/scene-config.py`), one process per live scene;
 *   - the Input project (`td/input-config.py`), the rig's MIDI and audio front
 *     end — one of a kind, one schema.
 *
 * The twelve scene processes run the same project, so they publish the same wire
 * names and share one schema, one read-only set, and one TD-side config file.
 * That is the opposite of `apps/example`, where the two instances deliberately
 * differ; here symmetry is the point, and duplicating the schema per scene
 * would only create twelve things to keep in sync.
 *
 * Sharing the names is safe because a wire name is scoped to its instance: every
 * scene publishes a plain `level`, and which one a control reads is decided by
 * the nearest `<LoaderProvider>` above it, not by the name.
 */

/** Static `{ id, url }` descriptor for one TD instance's Web Server DAT. */
export interface TDInstanceConfig {
  id: string;
  url: string;
}

export const host = import.meta.env.VITE_TD_HOST ?? 'localhost';

/**
 * One port per instance. Separate variables rather than a base + offset: the
 * ports are whatever each `.toe`'s WebGuiServer `Port` par says, and nothing
 * makes them contiguous.
 */
const guiPort = import.meta.env.VITE_TD_PORT_GUI ?? '8765';
const inputPort = import.meta.env.VITE_TD_PORT_INPUT ?? '8766';

/**
 * The GUI project. `id` matches its WebGuiServer `Identifier` par — the
 * `welcome` message carries that back, and the provider treats the config value
 * as authoritative when they disagree.
 */
export const guiInstance = {
  id: 'gui',
  url: `ws://${host}:${guiPort}`,
} as const satisfies TDInstanceConfig;

/** The Input project — the rig's MIDI and audio front end. */
export const inputInstance = {
  id: 'input',
  url: `ws://${host}:${inputPort}`,
} as const satisfies TDInstanceConfig;

/** The twelve external scene loaders, matching `SCENE_IDS` in `td/gui-config.py`
 * and `SCENE_KEYS` in the rig's `Tools/ExternalPorts`. */
export const layerIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Z1', 'Z2', 'Z3', 'Z4'] as const;
export type LayerId = (typeof layerIds)[number];

/**
 * The four layers that sit above the eight-deep stack. Ordinary layers on the
 * wire — same project, same schema — so nothing but the GUI treats them apart:
 * they get a compact tile with no video, no layout and no color, because in the
 * rig they are held, not performed.
 */
export const zLayerIds = ['Z1', 'Z2', 'Z3', 'Z4'] as const satisfies readonly LayerId[];
export type ZLayerId = (typeof zLayerIds)[number];

export function isZLayer(layer: LayerId): layer is ZLayerId {
  return (zLayerIds as readonly LayerId[]).includes(layer);
}

/** The number a layer wears on its tile: its place in the authored
 * {@link layerIds} order, not its position in a column that renders them
 * reversed and without the Z layers. */
export function layerNumber(layer: LayerId): number {
  return layerIds.indexOf(layer) + 1;
}

/** The loader a freshly-opened page targets. A layer is always selected — every
 * `selectedLayer` in the app is a `LayerId`, never `undefined`. */
export const defaultLayer: LayerId = 'A';
