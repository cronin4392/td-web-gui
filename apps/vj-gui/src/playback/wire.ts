import { host, type LayerId, type TDInstanceConfig } from './layers';
import type { TDConnection } from 'td-core';

/**
 * One port per instance. Separate variables rather than a base + offset: the
 * ports are whatever each `.toe`'s WebGuiServer `Port` par says, and nothing
 * makes them contiguous.
 */
const loaderAPort = import.meta.env.VITE_TD_PORT_SCENE_A ?? '4007';
const loaderBPort = import.meta.env.VITE_TD_PORT_SCENE_B ?? '5007';

/** The scene projects, in display order. Same schema, one `<Provider>` each. */
export const loaderInstances = [
  { id: 'sceneA', url: `ws://${host}:${loaderAPort}` },
  { id: 'sceneB', url: `ws://${host}:${loaderBPort}` },
] as const satisfies readonly TDInstanceConfig[];

/** id of one entry in {@link loaderInstances}, e.g. `'sceneA'` — distinct from
 * {@link LayerId} (`'A'`–`'H'`), which names an external scene *loader*. */
export type LoaderId = (typeof loaderInstances)[number]['id'];

/** The loader id a scene instance's video tile stands for when selected as the
 * active layer — `'sceneA'` -> `'A'`, `'sceneB'` -> `'B'`. */
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
 * Param schema shared by **both** scene instances — the TS half of the contract
 * with `td/scene-config.py`, which is likewise one file for both processes.
 *
 * All readouts today (`READOUTS` in that file), so every name here is in
 * {@link loaderReadonly}. The registry is empty, so nothing on a scene is
 * web-writable yet.
 */
export interface LoaderParams {
  cpuCookTime: number;
  level: number;
  performance: string[][];
}

/** Scene readout names, declared read-only so their controls render disabled. */
export const loaderReadonly = [
  'cpuCookTime',
  'level',
  'performance',
] as const satisfies readonly (keyof LoaderParams)[];

/** Wire name of a scene's text param — the TS half of the naming contract above. */
export function layerTextParam<N extends 1 | 2>(
  layer: LayerId,
  slot: N,
): `scene${LayerId}Text${N}` {
  return `scene${layer}Text${slot}`;
}

/**
 * `LoaderClient.call` is unavailable here: two providers are mounted from the one
 * factory, so it refuses to guess which. Components outside a scene provider —
 * the scene picker — reach a specific instance through {@link LayerConnections}
 * and this wrapper, which is the only place the untyped `call` is narrowed back
 * to {@link LoaderCalls}.
 */
export function loadToxOn(
  connection: TDConnection,
  path: string,
): Promise<LoaderCalls['loadScene']['result']> {
  return connection.call('loadScene', { path }) as Promise<LoaderCalls['loadScene']['result']>;
}
