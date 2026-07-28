import type { SceneId } from './layers';

/** Wire names of the per-loader text params, e.g. `sceneAText1`. */
export type SceneTextParamName = `scene${SceneId}Text${1 | 2}`;

/**
 * Param schema for the `vj-gui` instance: a `text1`/`text2` pair per
 * scene loader.
 */
export type VjGuiParams = Record<SceneTextParamName, string>;

/** GUI readout names, declared read-only so bound controls render disabled.
 * Empty since the scene catalog moved to `/api/scenes`. */
export const guiReadonly = [] as const satisfies readonly (keyof VjGuiParams)[];

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
export interface SceneCalls {
  loadScene: { args: { path: string }; result: { ok: boolean } };
  clearScene: { args?: undefined; result: { ok: boolean } };
}

/**
 * Param schema shared by **both** scene instances — the TS half of the contract
 * with `td/scene-config.py`, which is likewise one file for both processes.
 *
 * All readouts today (`READOUTS` in that file), so every name here is in
 * {@link sceneReadonly}. The registry is empty, so nothing on a scene is
 * web-writable yet.
 */
export interface SceneParams {
  cpuCookTime: number;
  level: number;
  performance: string[][];
}

/** Scene readout names, declared read-only so their controls render disabled. */
export const sceneReadonly = [
  'cpuCookTime',
  'level',
  'performance',
] as const satisfies readonly (keyof SceneParams)[];

/** Wire name of a scene's text param — the TS half of the naming contract above. */
export function sceneTextParam<N extends 1 | 2>(
  scene: SceneId,
  slot: N,
): `scene${SceneId}Text${N}` {
  return `scene${scene}Text${slot}`;
}
