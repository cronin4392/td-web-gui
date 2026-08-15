/**
 * The `createTDClient` factories, shared across the app's components — a
 * factory must be created once per *schema*, not per-component.
 *
 * Three factories for ten instances, because a factory selects a *schema*, not
 * an instance: its members bind the nearest `<Provider>` **of that factory**,
 * so the eight scene instances — same project, same wire names — share one.
 * `LoaderClient` rendered under sceneA's provider reads sceneA; the identical
 * markup under sceneB's reads sceneB.
 *
 * Scoping is per factory, so the providers may nest freely: `GuiProvider` and
 * `InputProvider` wrap the whole app in `App.tsx`, and a `GuiClient` control
 * down inside a scene tile still reaches the GUI project, not the scene.
 */

import type { JSX } from 'solid-js';
import { createTDClient } from 'td-core';
import { guiInstance, inputInstance, type LayerId } from './layers';
import {
  guiReadonly,
  inputReadonly,
  loaderInstances,
  loaderReadonly,
  type GuiCalls,
  type GuiHandlers,
  type GuiParams,
  type InputParams,
  type LoaderCalls,
  type LoaderId,
  type LoaderParams,
} from './wire';

/** The GUI project: the eight loaders' text params, the color ramp, the Color
 * scheme catalog, and the MIDI select button's `selectLayer`. */
export const GuiClient = createTDClient<GuiParams, GuiCalls, GuiHandlers>();

/** Every scene project: performance readouts, the video stream, and the
 * `loadScene` call. */
export const LoaderClient = createTDClient<LoaderParams, LoaderCalls>();

export const InputClient = createTDClient<InputParams>();

/** One scene instance's connection, typed by its params and its calls. */
export type LoaderConnection = ReturnType<typeof LoaderClient.useConnection>;

/** The live connection for each layer, filled in by the mounted scene providers.
 * A layer with no running process is simply absent. */
export type LayerConnections = Partial<Record<LayerId, LoaderConnection>>;

export type GuiParamName = keyof GuiParams & string;
export type { LayerId } from './layers';
export type { LayerTextParamName } from './wire';

/**
 * Resolves `layer` to its live connection and loads `path` on it — the one
 * place a catalog picker's `load` callback turns a layer id into an actual
 * TD connection. Rejects if that layer's loader process isn't connected.
 */
export async function loadOnLayer(
  layer: LayerId,
  connections: LayerConnections,
  path: string,
): Promise<void> {
  const connection = connections[layer];
  if (!connection) throw new Error(`Layer ${layer} has no connected scene process`);
  await connection.call('loadScene', { path });
}

/** `GuiClient.Provider` bound to the app's one GUI instance. */
export function GuiProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id} readonly={[...guiReadonly]}>
      {props.children}
    </GuiClient.Provider>
  );
}

export function InputProvider(props: { children: JSX.Element }): JSX.Element {
  return (
    <InputClient.Provider
      url={inputInstance.url}
      instance={inputInstance.id}
      readonly={[...inputReadonly]}
    >
      {props.children}
    </InputClient.Provider>
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
