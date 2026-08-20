import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from 'solid-js';
import type { SelectOption } from 'td-core';
import { sceneThumbnailUrlFrom } from '@domain/catalog/thumbnail';
import { RadioButton } from '@/ui/RadioButton';
import type { LayerId } from './layers';
import {
  activeSceneFolder,
  activeSceneName,
  COLOR_OPTIONS,
  LAYOUT_OPTIONS,
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
import styles from './LayerPreviews.module.css';

export function LayerPreviews(props: { class?: string }): JSX.Element {
  // Top of the column is the last layer, matching the rig's stacking order —
  // the layer nearest the audience sits nearest the top of the screen.
  const topDown = [...loaderInstances].reverse();
  return (
    <div class={[styles.grid, props.class].filter(Boolean).join(' ')}>
      <For each={topDown}>{(loader) => <LayerPanel loader={loader.id} />}</For>
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
  const level = LoaderClient.signal('level');
  // Published to PlaybackProvider because the scene picker sits outside every
  // scene provider and still has to call this instance. Only reachable from
  // in here.
  registerConnection(props.layer, LoaderClient.useConnection());
  onCleanup(() => registerConnection(props.layer, undefined));

  // A scene folder is not guaranteed to hold a thumbnail.jpg, and the server
  // refuses one outside the library — either way the tile falls back to black
  // rather than a broken-image glyph.
  const [broken, setBroken] = createSignal<string>();
  // Cleared whenever the layer moves to another scene, so a thumbnail the
  // server missed once is asked for again next time that scene comes up rather
  // than staying black for the life of the page.
  createEffect(
    on(
      () => activeScene.value(),
      () => setBroken(undefined),
      { defer: true },
    ),
  );
  const thumbnail = () => {
    const folder = activeSceneFolder(activeScene.value());
    const url = folder ? sceneThumbnailUrlFrom(folder) : undefined;
    return url && url !== broken() ? url : undefined;
  };

  return (
    <figure class={styles.layerPreview} data-active={props.active}>
      <div class={styles.params}>
        <ParamRadios
          layer={props.layer}
          name="layout"
          legend="Layout"
          prefix="L"
          options={LAYOUT_OPTIONS}
        />
        <ParamRadios
          layer={props.layer}
          name="color"
          legend="Color"
          prefix="C"
          options={COLOR_OPTIONS}
        />
      </div>
      <div class={styles.frame}>
        <button type="button" class={styles.tile} onClick={props.onSelect}>
          <Show when={video.stream(LOADER_STREAM)} keyed>
            {(_stream) => <LoaderClient.Video stream={LOADER_STREAM} />}
          </Show>
          <Show when={video.streamStatus(LOADER_STREAM) !== 'connected'}>
            <Show when={thumbnail()}>
              {(url) => (
                <img src={url()} alt="" class={styles.thumbnail} onError={() => setBroken(url())} />
              )}
            </Show>
            {/* 'off' is the toggle below doing what it was asked; the checkbox
              already says so, and an "off…" scrim would just hide the tile. */}
            <Show when={video.streamStatus(LOADER_STREAM) !== 'off'}>
              <div class={styles.overlay}>{video.streamStatus(LOADER_STREAM)}…</div>
            </Show>
          </Show>
          <span class={styles.sceneName} title={activeScene.value()}>
            {activeSceneName(activeScene.value()) ?? '—'}
          </span>
        </button>
        <PerformanceReadouts />
        <LoaderClient.StreamToggle
          stream={LOADER_STREAM}
          aria-label={`Layer ${props.layer} video`}
          class={styles.streamToggle}
        />
      </div>
      <div
        class={styles.level}
        style={{ '--level': `${Math.min(Math.max(level.value() ?? 0, 0), 1) * 100}%` }}
      />
    </figure>
  );
}

/**
 * A menu param as a column of position codes — `L1`/`L2`/`L3`, `C1`–`C4` —
 * because the previews column leaves no room for "Split X". The number is the option's
 * place in {@link LAYOUT_OPTIONS} / {@link COLOR_OPTIONS}, so reordering either
 * list renumbers codes the operator plays from memory.
 */
function ParamRadios(props: {
  layer: LayerId;
  name: 'layout' | 'color';
  legend: string;
  prefix: string;
  options: readonly SelectOption[];
}): JSX.Element {
  const binding = LoaderClient.signal(props.name);
  return (
    <fieldset class={styles.paramGroup}>
      <legend class="u-sr-only">{`Layer ${props.layer} ${props.legend}`}</legend>
      <For each={props.options}>
        {(option, index) => (
          // Grouped per layer as well as per param: one shared name would make
          // all eight tiles a single radio group.
          <RadioButton
            name={`layer-${props.layer}-${props.name}`}
            checked={binding.value() === option.value}
            onSelect={() => binding.setValue(option.value)}
          >
            {`${props.prefix}${index() + 1}`}
          </RadioButton>
        )}
      </For>
    </fieldset>
  );
}

function PerformanceReadouts(): JSX.Element {
  const stats = LoaderClient.signal('performance');
  const stat = (name: string) => performanceStat(stats.value(), name);
  // `pointer-events: none` so the overlay never swallows the click that selects
  // the layer — the tile underneath still drives the hover that reveals it.
  return (
    <table class={styles.stats}>
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

const healthColor: Record<Health, string | undefined> = {
  good: styles.good,
  warn: styles.warn,
  bad: styles.bad,
};

function StatRow(props: {
  label: string;
  value: number | undefined;
  format: (value: number) => string;
  health: (value: number) => Health;
}): JSX.Element {
  const color = () =>
    props.value === undefined ? styles.unknown : healthColor[props.health(props.value)];
  return (
    <tr>
      <td class={styles.dotCell}>
        <span aria-hidden="true" class={`${styles.dot} ${color()}`} />
      </td>
      <th class={styles.statLabel}>{props.label}</th>
      <td class={styles.statValue}>{props.value === undefined ? '' : props.format(props.value)}</td>
    </tr>
  );
}
