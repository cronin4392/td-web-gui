/**
 * TD instance configuration for the vj-gui app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * The page drives **three** TouchDesigner processes, of **two** kinds:
 *
 *   - the GUI project (`td/gui-config.py`), which owns the eight loaders'
 *     text params — one of a kind, one schema; which loader is active is
 *     local UI state (`selectedLayer` in `App.tsx`), not a TD-driven value;
 *   - the scene projects (`td/scene-config.py`), one process per live scene.
 *
 * The two scene processes run the same project, so they publish the same wire
 * names and share one schema, one read-only set, and one TD-side config file.
 * That is the opposite of `apps/example`, where the two instances deliberately
 * differ; here symmetry is the point, and duplicating the schema per scene
 * would only create two things to keep in sync.
 *
 * Sharing the names is safe because a wire name is scoped to its instance: both
 * scenes publish a plain `level`, and which one a control reads is decided by
 * the `<Provider>` it renders inside, not by the name.
 */

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
const guiPort = import.meta.env.VITE_TD_PORT_GUI ?? '8765';
const sceneAPort = import.meta.env.VITE_TD_PORT_SCENE_A ?? '4007';
const sceneBPort = import.meta.env.VITE_TD_PORT_SCENE_B ?? '5007';

/**
 * The GUI project. `id` matches its WebGuiServer `Identifier` par — the
 * `welcome` message carries that back, and the provider treats the config value
 * as authoritative when they disagree.
 */
export const guiInstance = {
  id: 'gui',
  url: `ws://${host}:${guiPort}`,
} as const satisfies TDInstanceConfig;

/** The scene projects, in display order. Same schema, one `<Provider>` each. */
export const sceneInstances = [
  { id: 'sceneA', url: `ws://${host}:${sceneAPort}` },
  { id: 'sceneB', url: `ws://${host}:${sceneBPort}` },
] as const satisfies readonly TDInstanceConfig[];

/** id of one entry in {@link sceneInstances}, e.g. `'sceneA'` — distinct from
 * {@link SceneId} (`'A'`–`'H'`), which names an external scene *loader*. */
export type SceneInstanceId = (typeof sceneInstances)[number]['id'];

/** The eight external scene loaders, matching `SCENE_IDS` in `td/gui-config.py`. */
export const sceneIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type SceneId = (typeof sceneIds)[number];

/** The loader a freshly-opened page targets. A layer is always selected — every
 * `selectedLayer` in the app is a `SceneId`, never `undefined`. */
export const defaultLayer: SceneId = 'A';

/** The loader id a scene instance's video tile stands for when selected as the
 * active layer — `'sceneA'` -> `'A'`, `'sceneB'` -> `'B'`. */
export function sceneIdForInstance(instance: SceneInstanceId): SceneId {
  return instance.slice('scene'.length) as SceneId;
}
