import { host, type LayerId, type TDInstanceConfig } from './layers';

/**
 * One port per instance. Separate variables rather than a base + offset: the
 * ports are whatever each `.toe`'s WebGuiServer `Port` par says, and nothing
 * makes them contiguous.
 */
const loaderAPort = import.meta.env.VITE_TD_PORT_SCENE_A ?? '4007';
const loaderBPort = import.meta.env.VITE_TD_PORT_SCENE_B ?? '5007';
const loaderCPort = import.meta.env.VITE_TD_PORT_SCENE_C ?? '6007';
const loaderDPort = import.meta.env.VITE_TD_PORT_SCENE_D ?? '7007';
// 8007 is skipped: the GUI project already owns the 8000 block (8765).
const loaderEPort = import.meta.env.VITE_TD_PORT_SCENE_E ?? '9007';
const loaderFPort = import.meta.env.VITE_TD_PORT_SCENE_F ?? '10007';
const loaderGPort = import.meta.env.VITE_TD_PORT_SCENE_G ?? '11007';
const loaderHPort = import.meta.env.VITE_TD_PORT_SCENE_H ?? '12007';

/** The scene projects, in display order. Same schema, one `<Provider>` each. */
export const loaderInstances = [
  { id: 'sceneA', url: `ws://${host}:${loaderAPort}` },
  { id: 'sceneB', url: `ws://${host}:${loaderBPort}` },
  { id: 'sceneC', url: `ws://${host}:${loaderCPort}` },
  { id: 'sceneD', url: `ws://${host}:${loaderDPort}` },
  { id: 'sceneE', url: `ws://${host}:${loaderEPort}` },
  { id: 'sceneF', url: `ws://${host}:${loaderFPort}` },
  { id: 'sceneG', url: `ws://${host}:${loaderGPort}` },
  { id: 'sceneH', url: `ws://${host}:${loaderHPort}` },
] as const satisfies readonly TDInstanceConfig[];

/** id of one entry in {@link loaderInstances}, e.g. `'sceneA'` — distinct from
 * {@link LayerId} (`'A'`–`'H'`), which names an external scene *loader*. */
export type LoaderId = (typeof loaderInstances)[number]['id'];

/** The loader id a scene instance's video tile stands for when selected as the
 * active layer — `'sceneA'` -> `'A'`, `'sceneH'` -> `'H'`. */
export function layerIdForLoader(instance: LoaderId): LayerId {
  return instance.slice('scene'.length) as LayerId;
}

/** Wire names of the per-loader text params, e.g. `sceneAText1`. */
export type LayerTextParamName = `scene${LayerId}Text${1 | 2}`;

/**
 * Param schema for the `vj-gui` instance: a `text1`/`text2` pair per
 * scene loader.
 */
export type GuiParams = Record<LayerTextParamName, string>;

/** GUI readout names, declared read-only so bound controls render disabled.
 * Empty since the scene catalog moved to `/api/scenes`. */
export const guiReadonly = [] as const satisfies readonly (keyof GuiParams)[];

/**
 * Calls each scene instance exposes — the TS half of `HANDLERS` in
 * `td/scene-config.py`.
 *
 * There is no `scene` argument: the connection *is* the routing. A call reaches
 * the one SceneLoader process it was sent to, which is why this bypasses the GUI
 * project (and its MessageDispatcher) entirely.
 *
 * `path` is the scene's absolute `.tox`, forward slashes only — TD's
 * `Loader.LoadScene` splits it on `/` into folder + name.
 *
 * A scene's layout and color are deliberately not here: the GUI project owns
 * them and pushes them to the scene over Touch In/Out, so this path cannot set
 * them. Inverting that is TODO.md #3.
 */
export interface LoaderCalls {
  loadScene: { args: { path: string }; result: { ok: boolean } };
  clearScene: { args?: undefined; result: { ok: boolean } };
}

/**
 * Param schema shared by **every** scene instance — the TS half of the contract
 * with `td/scene-config.py`, which is likewise one file for all eight processes.
 *
 * All readouts today (`READOUTS` in that file), so every name here is in
 * {@link loaderReadonly}. The registry is empty, so nothing on a scene is
 * web-writable yet.
 */
export interface LoaderParams {
  cpuCookTime: number;
  gpuCookTime: number;
  level: number;
  performance: string[][];
  /** `[['Scene', toxPath], ['SceneName', name], ['Folder', folder]]` — the
   * loader's own record of what it last loaded, straight from TD. Read via
   * {@link activeSceneFolder}. */
  activeScene: string[][];
}

/** Scene readout names, declared read-only so their controls render disabled. */
export const loaderReadonly = [
  'cpuCookTime',
  'gpuCookTime',
  'level',
  'performance',
  'activeScene',
] as const satisfies readonly (keyof LoaderParams)[];

/** Pulls the scene folder out of an `activeScene` readout table — `Folder`,
 * not `Scene`, so the caller needs no `.tox` parsing of its own (see
 * `sceneThumbnailUrl`). `undefined` before TD has synced one / while a layer
 * has never loaded anything. */
export function activeSceneFolder(table: string[][] | undefined): string | undefined {
  return table?.find(([key]) => key === 'Folder')?.[1] || undefined;
}

/** Wire name of the video stream each loader publishes over WebRTC. */
export const LOADER_STREAM = 'scene';

/** Wire name of a scene's text param — the TS half of the naming contract above. */
export function layerTextParam<N extends 1 | 2>(
  layer: LayerId,
  slot: N,
): `scene${LayerId}Text${N}` {
  return `scene${layer}Text${slot}`;
}
