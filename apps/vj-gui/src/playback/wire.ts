import type { SelectOption } from 'td-core';
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
 * The GUI's color ramp, as five separate names rather than one — a Ramp TOP
 * *is* a DAT of keyframes plus a handful of parameters, and `td-core` already
 * carries both kinds, so nothing about it needs a wire type of its own.
 * `rampGradient` in `@/ui/gradient` puts them back together.
 *
 * `rampKeys` is one row per keyframe, columns `pos, r, g, b, a`, all 0–1;
 * `rampType` and `rampInterp` carry TD's own menu keys (`horizontal`, `step`,
 * …). All five are TD → web only — see {@link guiReadonly}.
 */
export interface RampParams {
  rampKeys: string[][];
  rampType: string;
  rampInterp: string;
  rampPhase: number;
  rampPeriod: number;
}

/**
 * Param schema for the `vj-gui` instance: a `text1`/`text2` pair per
 * scene loader, plus the color ramp.
 */
export type GuiParams = Record<LayerTextParamName, string> & RampParams;

/** GUI readout names, declared read-only so bound controls render disabled —
 * `td/gui-config.py`'s `READOUTS` plus its non-writable `REGISTRY` entries. */
export const guiReadonly = [
  'rampKeys',
  'rampType',
  'rampInterp',
  'rampPhase',
  'rampPeriod',
] as const satisfies readonly (keyof GuiParams)[];

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
 * A scene's layout and color are deliberately not here: they are state, not
 * behaviour, so they ride {@link LoaderParams} as ordinary params.
 */
export interface LoaderCalls {
  loadScene: { args: { path: string }; result: { ok: boolean } };
  clearScene: { args?: undefined; result: { ok: boolean } };
}

/**
 * Param schema shared by **every** scene instance — the TS half of the contract
 * with `td/scene-config.py`, which is likewise one file for all eight processes.
 *
 * The names in {@link loaderReadonly} are read-only — that file's `READOUTS`
 * plus its non-writable `REGISTRY` entries. The rest the web can drive.
 */
export interface LoaderParams {
  level: number;
  /** The whole performance table, one `[name, value]` row per stat — read a
   * single one with {@link performanceStat}. */
  performance: string[][];
  /** Absolute `.tox` path the loader last loaded, straight from its `Scene`
   * par. Folder and name are derived here rather than sent — see
   * {@link activeSceneFolder}. */
  activeScene: string;
  /** Menu *keys* on the scene's own Post ops — {@link LAYOUT_OPTIONS} and
   * {@link COLOR_OPTIONS} are the web-side copy of those menus. */
  layout: string;
  color: string;
}

/** Scene readout names, declared read-only so their controls render disabled. */
export const loaderReadonly = [
  'level',
  'performance',
  'activeScene',
] as const satisfies readonly (keyof LoaderParams)[];

/**
 * The `Layout` / `Color` menus, mirroring the pars named by `REGISTRY` in
 * `td/scene-config.py`. Authored here rather than left to TD's announcement so
 * the dropdowns read as words and are populated before a scene connects. Keys
 * must still match TD's menu, which refuses a write naming one it doesn't have.
 */
export const LAYOUT_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'splitX', label: 'Split X' },
  { value: 'splitY', label: 'Split Y' },
] as const satisfies readonly SelectOption[];

export const COLOR_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'flipped', label: 'Flipped' },
  { value: 'edge', label: 'Edge' },
  { value: 'edgeOver', label: 'Edge Over' },
] as const satisfies readonly SelectOption[];

/** The folder holding a loader's active `.tox` — everything before the last
 * separator. `undefined` before TD has synced one / while a layer has never
 * loaded anything. Both separators are accepted because TD reports whatever
 * the par holds, and only `loadScene` on the way in is forward-slash-only. */
export function activeSceneFolder(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut <= 0) return undefined;
  const folder = path.slice(0, cut);
  // `C:` is a root the way `/` is, and naming a scene folder after it would
  // send the thumbnail plugin a request it can only refuse.
  return /^[A-Za-z]:$/.test(folder) ? undefined : folder;
}

/** One stat out of the `performance` table by its TD row name (`fps`,
 * `cookTime`, `gpu_mem_used`, …). `undefined` before TD has synced the table,
 * and for a row that isn't in it or doesn't hold a number. */
export function performanceStat(table: string[][] | undefined, stat: string): number | undefined {
  const cell = table?.find(([name]) => name === stat)?.[1]?.trim();
  // An empty cell is a stat TD hasn't filled in, not the zero `Number('')` reads.
  if (!cell) return undefined;
  const value = Number(cell);
  return Number.isFinite(value) ? value : undefined;
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
