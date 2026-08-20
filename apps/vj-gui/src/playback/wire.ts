import type { JsonValue, SelectOption } from 'td-core';
import { host, layerIds, type LayerId, type TDInstanceConfig } from './layers';

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
// The Z layers break the one-block-per-layer run: `ExternalPorts` gives them
// half-blocks off 13000, so Z2 is 13107 rather than the 14007 the pattern reads as.
const loaderZ1Port = import.meta.env.VITE_TD_PORT_SCENE_Z1 ?? '13007';
const loaderZ2Port = import.meta.env.VITE_TD_PORT_SCENE_Z2 ?? '13107';

/** The scene projects, in layer order. Same schema, one `<Provider>` each. */
export const loaderInstances = [
  { id: 'sceneA', url: `ws://${host}:${loaderAPort}` },
  { id: 'sceneB', url: `ws://${host}:${loaderBPort}` },
  { id: 'sceneC', url: `ws://${host}:${loaderCPort}` },
  { id: 'sceneD', url: `ws://${host}:${loaderDPort}` },
  { id: 'sceneE', url: `ws://${host}:${loaderEPort}` },
  { id: 'sceneF', url: `ws://${host}:${loaderFPort}` },
  { id: 'sceneG', url: `ws://${host}:${loaderGPort}` },
  { id: 'sceneH', url: `ws://${host}:${loaderHPort}` },
  { id: 'sceneZ1', url: `ws://${host}:${loaderZ1Port}` },
  { id: 'sceneZ2', url: `ws://${host}:${loaderZ2Port}` },
] as const satisfies readonly TDInstanceConfig[];

/** id of one entry in {@link loaderInstances}, e.g. `'sceneA'` — distinct from
 * {@link LayerId} (`'A'`–`'H'`, `'Z1'`, `'Z2'`), which names an external scene
 * *loader*. */
export type LoaderId = (typeof loaderInstances)[number]['id'];

/** The loader id a scene instance's video tile stands for when selected as the
 * active layer — `'sceneA'` -> `'A'`, `'sceneZ2'` -> `'Z2'`. */
export function layerIdForLoader(instance: LoaderId): LayerId {
  return instance.slice('scene'.length) as LayerId;
}

/** Wire names of the per-loader text params, e.g. `sceneAText1`. */
export type LayerTextParamName = `scene${LayerId}Text${1 | 2}`;

/** Authored here, like {@link LAYOUT_OPTIONS}: TD announces menus, not radios. */
export const BEAT_PERIODS = [1, 2, 4] as const;

/**
 * Param schema for the `vj-gui` instance: a `text1`/`text2` pair per
 * scene loader, plus the selected Color scheme and beat period.
 */
export type GuiParams = Record<LayerTextParamName, string> & {
  /**
   * Path of the Color scheme driving the GUI — TD's `Activecolorpath`, and the
   * `path` of one entry in the {@link GuiCalls} catalog.
   *
   * Writing it *is* selecting a scheme; everything TouchDesigner derives from a
   * color hangs off this one parameter. It reads back too, so a scheme picked
   * in TD's own panel moves the web's selection with it.
   */
  activeColorScheme: string;
  /** Index into {@link BEAT_PERIODS}, which is what TD's radio par holds — not
   * the period in beats. */
  beatPeriod: number;
};

/**
 * Calls the GUI instance exposes — the TS half of `HANDLERS` in
 * `td/gui-config.py`.
 *
 * The Color scheme catalog is a call rather than a readout because it is a
 * question asked once, not a value that streams: TD walks its own two
 * enumeration DATs and samples each scheme's ramp on demand, so nothing has to
 * be materialised in the network to watch. Re-ask it after a reconnect.
 */
export interface GuiCalls {
  colorSchemes: { args?: undefined; result: JsonValue };
}

/**
 * Calls the GUI instance invokes on the web — what its `Notify`/`Call` may name.
 *
 * `selectLayer` is the rig's MIDI select button reaching the page. An event
 * rather than a param because it is the press that carries meaning: the
 * selection stays the web's own, and nothing about it need outlive a project
 * that is on its way out.
 *
 * `layer` is a loader's `Scenekey` letter, but typed as a plain string: it
 * arrives off the wire, so it is a claim about a layer until
 * {@link asLayerId} has agreed.
 */
export interface GuiHandlers {
  selectLayer: { args: { layer: string } };
}

/** GUI readout names, declared read-only so bound controls render disabled —
 * `td/gui-config.py`'s `READOUTS` plus its non-writable `REGISTRY` entries.
 * Empty today: everything the GUI publishes, the web also drives. */
export const guiReadonly = [] as const satisfies readonly (keyof GuiParams)[];

/**
 * Param schema for the `input` instance — the TS half of `READOUTS` in
 * `td/input-config.py`.
 */
export interface InputParams {
  bpm: number;
  /** The analyser's three bands, in {@link AUDIO_BANDS} order. One
   * multi-channel readout rather than three, so the bands always describe the
   * same frame. */
  audio: number[];
}

/**
 * The bands `audio` carries, in the order `td/input-config.py` lists its
 * channels. That order is the entire contract — the wire sends bare numbers —
 * so this array is the one place the web restates it, the way
 * {@link LAYOUT_OPTIONS} restates a TD menu.
 */
export const AUDIO_BANDS = ['low', 'mid', 'high'] as const;

/** Input readout names, declared read-only so their controls render disabled. */
export const inputReadonly = ['bpm', 'audio'] as const satisfies readonly (keyof InputParams)[];

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
 * with `td/scene-config.py`, which is likewise one file for all ten processes.
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

/**
 * The name of a loader's active scene — the `.tox`'s filename, extension
 * dropped. `undefined` for a layer that has never loaded anything.
 *
 * Derived from the same par as {@link activeSceneFolder} rather than read from
 * the Loader's own `SceneName` cell, which would reintroduce the trap
 * `td/scene-config.py` documents over `activeScene`: that table is fed by an
 * Evaluate DAT, TD is pull-based, and with nothing demanding it the cell never
 * cooks. The par is already on the wire and the Loader derives its own name
 * from it by the same split, so there is nothing to learn by asking twice.
 */
export function activeSceneName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const file = path.slice(cut + 1);
  return file ? file.replace(/\.tox$/i, '') : undefined;
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

/** A `selectLayer` payload's `layer` as a {@link LayerId}, `undefined` for a
 * letter that names no loader — a loader whose `Scenekey` is blank or mis-set
 * says nothing about where the operator wants to be, so its press is dropped
 * rather than answered by moving the selection somewhere they didn't ask for. */
export function asLayerId(value: string | undefined): LayerId | undefined {
  return layerIds.includes(value as LayerId) ? (value as LayerId) : undefined;
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
