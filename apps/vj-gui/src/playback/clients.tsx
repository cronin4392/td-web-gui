/**
 * The `createTDClient` factories, shared across the app's components — a
 * factory must be created once per *schema*, not per-component.
 *
 * Two factories for three instances, because a factory is purely compile-time:
 * its components bind to whichever `<Provider>` they render inside, so the two
 * scene instances — same project, same wire names — share one. `LoaderClient`
 * rendered under sceneA's provider reads sceneA; the identical markup under
 * sceneB's reads sceneB.
 */

import type { JSX } from 'solid-js';
import { createTDClient, type TDConnection } from 'td-core';
import { guiInstance, type LayerId } from './layers';
import {
  guiReadonly,
  loaderInstances,
  loaderReadonly,
  type GuiParams,
  type LoaderCalls,
  type LoaderId,
  type LoaderParams,
} from './wire';

/** The GUI project: the eight loaders' text params and the scene library. */
export const GuiClient = createTDClient<GuiParams>();

/** Both scene projects: performance readouts, the video stream, and the
 * `loadScene` call. */
export const LoaderClient = createTDClient<LoaderParams, LoaderCalls>();

/** The live connection for each layer, filled in by the mounted scene providers.
 * A layer with no running process is simply absent. */
export type LayerConnections = Partial<Record<LayerId, TDConnection>>;

export type GuiParamName = keyof GuiParams & string;
export type { LayerId } from './layers';
export type { LayerTextParamName } from './wire';

/** `GuiClient.Provider` bound to the app's one GUI instance. */
export function GuiProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id} readonly={[...guiReadonly]}>
      {props.children}
    </GuiClient.Provider>
  );
}

/**
 * `LoaderClient.Provider` bound to one scene instance, keyed by id rather than
 * `url`/`instance` — looks the connection details up in `loaderInstances` so
 * call sites never repeat them, and picking up a third scene later is a
 * `loaderInstances` edit, not a call-site edit.
 */
export function LoaderProvider(props: {
  loader: LoaderId;
  video?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const instance = loaderInstances.find((s) => s.id === props.loader);
  if (!instance) throw new Error(`[td] unknown scene id: ${props.loader}`);
  return (
    <LoaderClient.Provider
      url={instance.url}
      instance={instance.id}
      readonly={[...loaderReadonly]}
      video={props.video}
    >
      {props.children}
    </LoaderClient.Provider>
  );
}
