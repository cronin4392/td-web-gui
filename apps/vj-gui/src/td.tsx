/**
 * The `createTDClient` factories, shared across the app's components — a
 * factory must be created once per *schema*, not per-component.
 *
 * Two factories for three instances, because a factory is purely compile-time:
 * its components bind to whichever `<Provider>` they render inside, so the two
 * scene instances — same project, same wire names — share one. `SceneClient`
 * rendered under sceneA's provider reads sceneA; the identical markup under
 * sceneB's reads sceneB.
 */

import type { JSX } from 'solid-js';
import { createTDClient, type TDConnection } from 'td-core';
import {
  guiInstance,
  guiReadonly,
  sceneInstances,
  sceneReadonly,
  type SceneCalls,
  type SceneId,
  type SceneInstanceId,
  type SceneParams,
  type VjGuiParams,
} from './td.config';

/** The GUI project: the eight loaders' text params and the scene library. */
export const GuiClient = createTDClient<VjGuiParams>();

/** Both scene projects: performance readouts, the video stream, and the
 * `loadScene` call. */
export const SceneClient = createTDClient<SceneParams, SceneCalls>();

/** The live connection for each layer, filled in by the mounted scene providers.
 * A layer with no running process is simply absent. */
export type SceneConnections = Partial<Record<SceneId, TDConnection>>;

/**
 * `SceneClient.call` is unavailable here: two providers are mounted from the one
 * factory, so it refuses to guess which. Components outside a scene provider —
 * the scene picker — reach a specific instance through {@link SceneConnections}
 * and this wrapper, which is the only place the untyped `call` is narrowed back
 * to {@link SceneCalls}.
 */
export function loadSceneOn(
  connection: TDConnection,
  path: string,
): Promise<SceneCalls['loadScene']['result']> {
  return connection.call('loadScene', { path }) as Promise<SceneCalls['loadScene']['result']>;
}

export type VjGuiParamName = keyof VjGuiParams & string;
export type { SceneId, SceneTextParamName } from './td.config';

/** `GuiClient.Provider` bound to the app's one GUI instance. */
export function GuiProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id} readonly={[...guiReadonly]}>
      {props.children}
    </GuiClient.Provider>
  );
}

/**
 * `SceneClient.Provider` bound to one scene instance, keyed by id rather than
 * `url`/`instance` — looks the connection details up in `sceneInstances` so
 * call sites never repeat them, and picking up a third scene later is a
 * `sceneInstances` edit, not a call-site edit.
 */
export function SceneProvider(props: {
  scene: SceneInstanceId;
  video?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const instance = sceneInstances.find((s) => s.id === props.scene);
  if (!instance) throw new Error(`[td] unknown scene id: ${props.scene}`);
  return (
    <SceneClient.Provider
      url={instance.url}
      instance={instance.id}
      readonly={[...sceneReadonly]}
      video={props.video}
    >
      {props.children}
    </SceneClient.Provider>
  );
}
