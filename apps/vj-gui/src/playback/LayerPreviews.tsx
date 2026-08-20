import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from 'solid-js';
import { unescapeNewlines, type SelectOption } from 'td-core';
import { sceneThumbnailUrlFrom } from '@domain/catalog/thumbnail';
import { RadioButton } from '@/ui/RadioButton';
import { isZLayer, type LayerId } from './layers';
import {
  activeSceneFolder,
  activeSceneName,
  COLOR_OPTIONS,
  LAYOUT_OPTIONS,
  LOADER_STREAM,
  layerIdForLoader,
  layerTextParam,
  loaderInstances,
  performanceStat,
  type LoaderId,
} from './wire';
import { GuiClient, LoaderClient, LoaderProvider } from './clients';
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
  const zLoaders = loaderInstances.filter((loader) => isZLayer(layerIdForLoader(loader.id)));
  // Top of the column is the last layer, matching the rig's stacking order —
  // the layer nearest the audience sits nearest the top of the screen. The Z
  // layers sit above the lot of them, which is where they sit in the mix too.
  const topDown = loaderInstances
    .filter((loader) => !isZLayer(layerIdForLoader(loader.id)))
    .reverse();
  return (
    <div class={[styles.column, props.class].filter(Boolean).join(' ')}>
      <div class={styles.zGrid}>
        <For each={zLoaders}>{(loader) => <LayerPanel loader={loader.id} compact />}</For>
      </div>
      <div class={styles.grid}>
        <For each={topDown}>{(loader) => <LayerPanel loader={loader.id} />}</For>
      </div>
    </div>
  );
}

/**
 * One scene instance — its video tile and its performance readouts, behind its
 * own provider. Rendered once per entry in `loaderInstances`, so each scene gets
 * its own socket, its own WebRTC peer, and its own reconnect clock; drop one
 * scene's `.toe` and only that tile goes dark.
 *
 * `compact` skips the WebRTC peer entirely rather than merely hiding the video:
 * a Z layer is held rather than performed, so it is not worth a stream.
 *
 * The body is a separate component because `useVideo()` reads the nearest
 * provider from context, and the provider isn't in context until inside it.
 */
function LayerPanel(props: { loader: LoaderId; compact?: boolean }): JSX.Element {
  const { selectedLayer, selectLayer } = usePlayback();
  const layer = layerIdForLoader(props.loader);
  const Body = props.compact ? CompactLayerBody : LayerBody;
  return (
    <LoaderProvider loader={props.loader} video={!props.compact}>
      <Body layer={layer} active={layer === selectedLayer()} onSelect={() => selectLayer(layer)} />
    </LoaderProvider>
  );
}

/**
 * The same markup for every scene — its names come from the one `LoaderParams`
 * schema, and the provider above decides which process answers them.
 */
function LayerBody(props: { layer: LayerId; active: boolean; onSelect: () => void }): JSX.Element {
  const video = LoaderClient.useVideo();
  const scene = createActiveScene();
  const level = LoaderClient.signal('level');
  publishConnection(props.layer);

  return (
    <figure
      ref={revealWhenActive(() => props.active)}
      class={styles.layerPreview}
      data-active={props.active}
    >
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
            <SceneThumbnail scene={scene} />
            {/* 'off' is the toggle below doing what it was asked; the checkbox
              already says so, and an "off…" scrim would just hide the tile. */}
            <Show when={video.streamStatus(LOADER_STREAM) !== 'off'}>
              <div class={styles.overlay}>{video.streamStatus(LOADER_STREAM)}…</div>
            </Show>
          </Show>
          <LayerTexts layer={props.layer} />
          <SceneName path={scene.path()} />
        </button>
        <PerformanceReadouts />
        <LoaderClient.StreamToggle
          stream={LOADER_STREAM}
          aria-label={`Layer ${props.layer} video`}
          class={styles.streamToggle}
        />
      </div>
      <div class={styles.level} style={levelStyle(level.value())} />
    </figure>
  );
}

/**
 * The layer's two captions, echoed over its tile so the operator can read what
 * every layer is saying without selecting each one. They live on the GUI
 * instance rather than the loader, so this reaches past `LoaderProvider` to the
 * app-wide `GuiProvider` — a different factory, so the nearer provider doesn't
 * shadow it.
 */
function LayerTexts(props: { layer: LayerId }): JSX.Element {
  const text1 = layerText(props.layer, 1);
  const text2 = layerText(props.layer, 2);
  const lines = () => [text1(), text2()].filter((text) => text !== undefined);
  return (
    <span class={styles.texts}>
      <For each={lines()}>{(line) => <span class={styles.textLine}>{line}</span>}</For>
    </span>
  );
}

function layerText(layer: LayerId, slot: 1 | 2): () => string | undefined {
  const binding = GuiClient.signal(layerTextParam(layer, slot));
  return () => unescapeNewlines(binding.value() ?? '').trim() || undefined;
}

/**
 * A Z layer: the thumbnail, the scene name, the level and the performance
 * readouts, and nothing else. No video, and no layout or color — those are
 * performance controls, and a Z layer is set once and left.
 */
function CompactLayerBody(props: {
  layer: LayerId;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const scene = createActiveScene();
  const level = LoaderClient.signal('level');
  publishConnection(props.layer);

  return (
    <figure
      ref={revealWhenActive(() => props.active)}
      class={`${styles.layerPreview} ${styles.compact}`}
      data-active={props.active}
    >
      <div class={styles.frame}>
        <button
          type="button"
          class={styles.tile}
          onClick={props.onSelect}
          aria-label={`Layer ${props.layer}`}
        >
          <SceneThumbnail scene={scene} />
          <SceneName path={scene.path()} />
        </button>
        <PerformanceReadouts />
      </div>
      <div class={styles.level} style={levelStyle(level.value())} />
    </figure>
  );
}

/**
 * Scrolls a layer back into the previews column when it becomes the selected
 * one, so selecting from anywhere but the tile itself — the scene picker, a MIDI
 * pad — doesn't leave the operator watching a tile that is scrolled out of sight.
 * `nearest` so an already-visible tile stays exactly where it is.
 */
function revealWhenActive(active: () => boolean): (figure: HTMLElement) => void {
  let figure: HTMLElement | undefined;
  createEffect(() => {
    if (active()) figure?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  return (element) => {
    figure = element;
  };
}

/**
 * Publishes this loader's connection to `PlaybackProvider`, because the scene
 * picker sits outside every scene provider and still has to call this instance.
 * Only reachable from in here.
 */
function publishConnection(layer: LayerId): void {
  const { registerConnection } = usePlayback();
  registerConnection(layer, LoaderClient.useConnection());
  onCleanup(() => registerConnection(layer, undefined));
}

function createActiveScene() {
  const activeScene = LoaderClient.signal('activeScene');
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
  return { path: () => activeScene.value(), thumbnail, markBroken: setBroken };
}

type ActiveScene = ReturnType<typeof createActiveScene>;

function SceneThumbnail(props: { scene: ActiveScene }): JSX.Element {
  return (
    <Show when={props.scene.thumbnail()}>
      {(url) => (
        <img
          src={url()}
          alt=""
          class={styles.thumbnail}
          onError={() => props.scene.markBroken(url())}
        />
      )}
    </Show>
  );
}

function SceneName(props: { path: string | undefined }): JSX.Element {
  return (
    <span class={styles.sceneName} title={props.path}>
      {activeSceneName(props.path) ?? '—'}
    </span>
  );
}

function levelStyle(level: number | undefined): JSX.CSSProperties {
  return { '--level': `${Math.min(Math.max(level ?? 0, 0), 1) * 100}%` };
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
