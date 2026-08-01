import { For, Show, createSignal, onCleanup, type JSX } from 'solid-js';
import { sceneThumbnailUrlFrom } from '@domain/catalog/thumbnail';
import type { LayerId } from './layers';
import {
  activeSceneFolder,
  LOADER_STREAM,
  layerIdForLoader,
  loaderInstances,
  type LoaderId,
} from './wire';
import { LoaderClient, LoaderProvider } from './clients';
import { usePlayback } from './PlaybackProvider';

export function LayerPreviews(): JSX.Element {
  return (
    <div class="grid grid-cols-8 gap-2">
      <For each={loaderInstances}>{(loader) => <LayerPanel loader={loader.id} />}</For>
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
function LayerPanel(props: { loader: LoaderId }): JSX.Element {
  const { selectedLayer, selectLayer } = usePlayback();
  const layer = layerIdForLoader(props.loader);
  return (
    <LoaderProvider loader={props.loader} video>
      <LayerBody
        label={props.loader}
        layer={layer}
        active={layer === selectedLayer()}
        onSelect={() => selectLayer(layer)}
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
  layer: LayerId;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const { registerConnection } = usePlayback();
  const video = LoaderClient.useVideo();
  const activeScene = LoaderClient.signal('activeScene');
  // Published to PlaybackProvider because the scene picker sits outside every
  // scene provider and still has to call this instance. Only reachable from
  // in here.
  registerConnection(props.layer, LoaderClient.useConnection());
  onCleanup(() => registerConnection(props.layer, undefined));

  // A scene folder is not guaranteed to hold a thumbnail.jpg, and the server
  // refuses one outside the library — either way the tile falls back to black
  // rather than a broken-image glyph.
  const [broken, setBroken] = createSignal<string>();
  const thumbnail = () => {
    const folder = activeSceneFolder(activeScene.value());
    const url = folder ? sceneThumbnailUrlFrom(folder) : undefined;
    return url && url !== broken() ? url : undefined;
  };

  return (
    <figure class="m-0">
      <button
        type="button"
        class="video-tile block w-full cursor-pointer border-2 p-0 aspect-video bg-black relative"
        classList={{ 'border-blue-500': props.active, 'border-transparent': !props.active }}
        onClick={props.onSelect}
      >
        <Show when={video.stream(LOADER_STREAM)} keyed>
          {(_stream) => <LoaderClient.Video stream={LOADER_STREAM} />}
        </Show>
        <Show when={video.streamStatus(LOADER_STREAM) !== 'connected'}>
          <Show when={thumbnail()}>
            {(url) => (
              <img
                src={url()}
                alt=""
                class="absolute inset-0 h-full w-full object-cover"
                onError={() => setBroken(url())}
              />
            )}
          </Show>
          {/* 'off' is the toggle below doing what it was asked; the checkbox
              already says so, and an "off…" scrim would just hide the tile. */}
          <Show when={video.streamStatus(LOADER_STREAM) !== 'off'}>
            <div class="video-overlay">{video.streamStatus(LOADER_STREAM)}…</div>
          </Show>
        </Show>
      </button>
      <figcaption class="text-xs text-neutral-500">
        <label>
          <LoaderClient.StreamToggle stream={LOADER_STREAM} />
          {props.label}
        </label>
      </figcaption>
      <LoaderClient.RangeInput name="level" min={0} max={1} step={0.01} readOnly />
      <table>
        <tbody>
          <tr>
            <th>CPU</th>
            <td>
              <LoaderClient.Value name="cpuCookTime" format={(v) => `${Number(v).toFixed(1)}ms`} />
            </td>
          </tr>
          <tr>
            <th>GPU</th>
            <td>
              <LoaderClient.Value name="gpuCookTime" format={(v) => `${Number(v).toFixed(1)}ms`} />
            </td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
