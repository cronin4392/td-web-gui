/**
 * The `createTDClient` factories, shared across the app's components — a
 * factory must be created once per *schema*, not per-component.
 *
 * Two factories for fifteen instances, because a factory selects a *schema*,
 * not an instance: its members bind the nearest `<Provider>` **of that factory**,
 * so the fourteen Layers — same scene project, same wire names — share one.
 * `LoaderClient` rendered under sceneA's provider reads sceneA; the identical
 * markup under sceneB's reads sceneB.
 *
 * Scoping is per factory, so the providers may nest freely: `InputProvider`
 * wraps the whole app in `App.tsx`, and an `InputClient` control down inside a
 * Layer preview still reaches the Input project, not the Layer's.
 */

import type { JSX } from 'solid-js';
import { createTDClient } from 'td-core';
import { inputInstance, type LayerId } from './layers';
import {
  inputReadonly,
  loaderInstances,
  loaderReadonly,
  type InputCalls,
  type InputHandlers,
  type InputParams,
  type LoaderCalls,
  type LoaderHandlers,
  type LoaderId,
  type LoaderParams,
} from './wire';

/** Every scene project: performance readouts, the video stream, the
 * `loadScene` call, and the `cleared` event. */
export const LoaderClient = createTDClient<LoaderParams, LoaderCalls, LoaderHandlers>();

export const InputClient = createTDClient<InputParams, InputCalls, InputHandlers>();

/** One Loader instance's connection, typed by its params and its calls. */
export type LoaderConnection = ReturnType<typeof LoaderClient.useConnection>;

/** The live connection for each layer, filled in by the mounted Loader providers.
 * A layer with no running process is simply absent. */
export type LayerConnections = Partial<Record<LayerId, LoaderConnection>>;

export type { LayerId } from './layers';

/**
 * Resolves `layer` to its live connection and loads a scene on it — the one
 * place a layer id turns into an actual TD connection for a load. Rejects if
 * that layer's loader process isn't connected.
 */
export async function loadOnLayer(
  layer: LayerId,
  connections: LayerConnections,
  scene: LoaderCalls['loadScene']['args'],
): Promise<void> {
  const connection = connections[layer];
  if (!connection) throw new Error(`Layer ${layer} has no connected Loader`);
  await connection.call('loadScene', scene);
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
 * `LoaderClient.Provider` bound to one Loader instance, keyed by id rather than
 * `url`/`instance` — looks the connection details up in `loaderInstances` so
 * call sites never repeat them, and picking up another Layer later is a
 * `loaderInstances` edit, not a call-site edit.
 */
export function LoaderProvider(props: {
  loader: LoaderId;
  video?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const instance = loaderInstances.find((s) => s.id === props.loader);
  if (!instance) throw new Error(`[td] unknown Loader id: ${props.loader}`);
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
