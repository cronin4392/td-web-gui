import { For, Show, createSignal, onCleanup, type JSX } from 'solid-js';
import { sceneThumbnailUrlFrom } from '@domain/catalog/thumbnail';
import type { LayerId } from './layers';
import {
  activeSceneFolder,
  LOADER_STREAM,
  layerIdForLoader,
  loaderInstances,
  performanceStat,
  type LoaderId,
} from './wire';
import { LoaderClient, LoaderProvider } from './clients';
import { usePlayback } from './PlaybackProvider';
import {
  atLeast,
  under,
  COOK_TIME_LIMITS,
  FPS_LIMITS,
  GPU_MEMORY_LIMITS,
  type Health,
} from './health';

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
function LayerBody(props: { layer: LayerId; active: boolean; onSelect: () => void }): JSX.Element {
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
      <div class="group relative">
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
        <PerformanceReadouts />
        <LoaderClient.StreamToggle
          stream={LOADER_STREAM}
          aria-label={`Layer ${props.layer} video`}
          class="absolute bottom-0 left-0 w-4 h-4"
        />
      </div>
      <LoaderClient.RangeInput name="level" min={0} max={1} step={0.01} readOnly />
    </figure>
  );
}

function PerformanceReadouts(): JSX.Element {
  const stats = LoaderClient.signal('performance');
  const stat = (name: string) => performanceStat(stats.value(), name);
  // `pointer-events-none` so the overlay never swallows the click that selects
  // the layer — the button underneath still triggers the `group` hover.
  return (
    <table class="pointer-events-none absolute left-1 top-1 font-mono text-xs text-left text-white">
      <tbody>
        <StatRow
          label="FPS"
          value={stat('fps')}
          format={(v) => v.toFixed(0)}
          health={(v) => atLeast(v, FPS_LIMITS)}
        />
        <StatRow
          label="Cook"
          value={stat('cookTime')}
          format={(v) => `${v.toFixed(1)}ms`}
          health={(v) => under(v, COOK_TIME_LIMITS)}
        />
        <StatRow
          label="GPU Mem"
          value={stat('gpu_mem_used')}
          format={(v) => `${v.toFixed(0)}MB`}
          health={(v) => under(v, GPU_MEMORY_LIMITS)}
        />
      </tbody>
    </table>
  );
}

const healthColor: Record<Health, string> = {
  good: 'bg-green-400',
  warn: 'bg-amber-400',
  bad: 'bg-red-400',
};

const hoverReveal = 'bg-black/60 opacity-0 transition-opacity group-hover:opacity-100';

function StatRow(props: {
  label: string;
  value: number | undefined;
  format: (value: number) => string;
  health: (value: number) => Health;
}): JSX.Element {
  const color = () =>
    props.value === undefined ? 'bg-neutral-700' : healthColor[props.health(props.value)];
  return (
    <tr>
      <td class="pr-1">
        {/* The ring keeps a dot legible over a bright frame. */}
        <span
          aria-hidden="true"
          class={`block h-2 w-2 rounded-full ring-1 ring-black/50 ${color()}`}
        />
      </td>
      <th class={`px-1 ${hoverReveal}`}>{props.label}</th>
      <td class={`pr-1 ${hoverReveal}`}>
        {props.value === undefined ? '' : props.format(props.value)}
      </td>
    </tr>
  );
}
