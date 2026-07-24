/**
 * TD instance configuration for the text-selector app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * The typed param schema for each instance lives beside this config, along with
 * the scene-loader naming contract it shares with `td/config.py`.
 */

/** Static `{ id, url }` descriptor for one TD instance's Web Server DAT. */
export interface TDInstanceConfig {
  id: string
  url: string
}

const host = import.meta.env.VITE_TD_HOST ?? 'localhost'
const port = import.meta.env.VITE_TD_PORT ?? '9980'

export const instances = [
  { id: 'text-selector', url: `ws://${host}:${port}` },
] as const satisfies readonly TDInstanceConfig[]

/** The eight external scene loaders, matching `SCENE_IDS` in `td/config.py`. */
export const sceneIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export type SceneId = (typeof sceneIds)[number]

/** Wire names of the per-loader text params, e.g. `sceneAText1`. */
export type SceneTextParamName = `scene${SceneId}Text${1 | 2}`

/**
 * Param schema for the `text-selector` instance: a `text1`/`text2` pair per
 * scene loader, plus the loader selection that decides which pair the UI shows.
 */
export interface TextSelectorParams extends Record<SceneTextParamName, string> {
  /** Path of the selected loader COMP, e.g. `/GUI/ExternalScenes/SceneA`. */
  selectedLoader: string
}

/** Wire name of a scene's text param — the TS half of the naming contract above. */
export function sceneTextParam<N extends 1 | 2>(
  scene: SceneId,
  slot: N,
): `scene${SceneId}Text${N}` {
  return `scene${scene}Text${slot}`
}

const LOADER_PATH_PREFIX = '/GUI/ExternalScenes/Scene'

/**
 * Scene id behind a `selectedLoader` path, or `undefined` while the value is
 * still unsynced or points at something that isn't one of the eight loaders.
 */
export function sceneIdFromLoaderPath(path: string | undefined): SceneId | undefined {
  if (path === undefined || !path.startsWith(LOADER_PATH_PREFIX)) return undefined
  const id = path.slice(LOADER_PATH_PREFIX.length)
  return sceneIds.find((scene) => scene === id)
}
