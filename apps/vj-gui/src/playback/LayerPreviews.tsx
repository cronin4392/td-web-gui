import { For, Show, onCleanup, type JSX } from 'solid-js';
import type { TDConnection } from 'td-core';
import type { LayerId } from './layers';
import { layerIdForLoader, loaderInstances, type LoaderId } from './wire';
import { LoaderClient, LoaderProvider } from './clients';

type ConnectionSink = (layer: LayerId, connection: TDConnection | undefined) => void;

export function LayerPreviews(props: {
  selected: LayerId;
  onSelect: (layer: LayerId) => void;
  onConnection: ConnectionSink;
}): JSX.Element {
  return (
    <div class="grid grid-cols-8 gap-2">
      <For each={loaderInstances}>
        {(loader) => (
          <LayerPanel
            loader={loader.id}
            selected={props.selected}
            onSelect={props.onSelect}
            onConnection={props.onConnection}
          />
        )}
      </For>
    </div>
  );
}

/**
 * One scene instance — its video tile and its performance readouts, behind its
 * own provider. Rendered once per entry in `loaderInstances`, so each scene gets
 * its own socket, its own WebRTC peer, and its own reconnect clock; drop one
 * scene's `.toe` and only that tile goes dark.
 *
 * The body is a separate component because `useVideo()` reads the nearest
 * provider from context, and the provider isn't in context until inside it.
 */
function LayerPanel(props: {
  loader: LoaderId;
  selected: LayerId;
  onSelect: (layer: LayerId) => void;
  onConnection: ConnectionSink;
}): JSX.Element {
  const layer = layerIdForLoader(props.loader);
  return (
    <LoaderProvider loader={props.loader} video>
      <LayerBody
        label={props.loader}
        active={layer === props.selected}
        onSelect={() => props.onSelect(layer)}
        onConnection={(connection) => props.onConnection(layer, connection)}
      />
    </LoaderProvider>
  );
}

/**
 * The same markup for every scene — its names come from the one `LoaderParams`
 * schema, and the provider above decides which process answers them.
 */
function LayerBody(props: {
  label: string;
  active: boolean;
  onSelect: () => void;
  onConnection: (connection: TDConnection | undefined) => void;
}): JSX.Element {
  const video = LoaderClient.useVideo();
  // Published upward because the scene picker sits outside every scene provider
  // and still has to call this instance. Only reachable from in here.
  props.onConnection(LoaderClient.useConnection());
  onCleanup(() => props.onConnection(undefined));
  return (
    <figure class="m-0">
      <Show when={video.stream('scene')} keyed>
        {(_stream) => (
          <button
            type="button"
            class="video-tile block w-full cursor-pointer border-2 p-0"
            classList={{ 'border-blue-500': props.active, 'border-transparent': !props.active }}
            onClick={props.onSelect}
          >
            <LoaderClient.Video stream="scene" />
            <Show when={video.streamStatus('scene') !== 'connected'}>
              <div class="video-overlay">{video.streamStatus('scene')}…</div>
            </Show>
          </button>
        )}
      </Show>
      <figcaption class="text-xs text-neutral-500">{props.label}</figcaption>
      <LoaderClient.RangeInput name="level" min={0} max={1} step={0.01} readOnly />
      <fieldset>
        <label>CPU Cooktime </label>
        <LoaderClient.Value name="cpuCookTime" format={(v) => `${Number(v).toFixed(1)}ms`} />
      </fieldset>
      {/* TODO: Table not getting data after load */}
      {/* <LoaderClient.Table name="performance" header /> */}
    </figure>
  );
}
