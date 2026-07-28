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
import { createTDClient } from 'td-core';
import {
  guiInstance,
  sceneInstances,
  sceneReadonly,
  type SceneInstanceId,
  type SceneParams,
  type VjGuiParams,
} from './td.config';

/** The GUI project: loader selection and the eight loaders' text params. */
export const GuiClient = createTDClient<VjGuiParams>();

/** Both scene projects: performance readouts and the scene video stream. */
export const SceneClient = createTDClient<SceneParams>();

export type VjGuiParamName = keyof VjGuiParams & string;
export type { SceneId, SceneTextParamName } from './td.config';

/** `GuiClient.Provider` bound to the app's one GUI instance. */
export function GuiProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id}>
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
