import { For, Show, onCleanup, type JSX } from 'solid-js';
import type { TDConnection } from 'td-core';
import {
  sceneIdForInstance,
  sceneInstances,
  type SceneId,
  type SceneInstanceId,
} from '../td.config';
import { SceneClient, SceneProvider } from '../td';

type ConnectionSink = (layer: SceneId, connection: TDConnection | undefined) => void;

export function LayerPreviews(props: {
  selected: SceneId;
  onSelect: (layer: SceneId) => void;
  onConnection: ConnectionSink;
}): JSX.Element {
  return (
    <div class="grid grid-cols-8 gap-2">
      <For each={sceneInstances}>
        {(scene) => (
          <LayerPanel
            scene={scene.id}
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
 * own provider. Rendered once per entry in `sceneInstances`, so each scene gets
 * its own socket, its own WebRTC peer, and its own reconnect clock; drop one
 * scene's `.toe` and only that tile goes dark.
 *
 * The body is a separate component because `useVideo()` reads the nearest
 * provider from context, and the provider isn't in context until inside it.
 */
function LayerPanel(props: {
  scene: SceneInstanceId;
  selected: SceneId;
  onSelect: (layer: SceneId) => void;
  onConnection: ConnectionSink;
}): JSX.Element {
  const layer = sceneIdForInstance(props.scene);
  return (
    <SceneProvider scene={props.scene} video>
      <LayerBody
        label={props.scene}
        active={layer === props.selected}
        onSelect={() => props.onSelect(layer)}
        onConnection={(connection) => props.onConnection(layer, connection)}
      />
    </SceneProvider>
  );
}

/**
 * The same markup for every scene — its names come from the one `SceneParams`
 * schema, and the provider above decides which process answers them.
 */
function LayerBody(props: {
  label: string;
  active: boolean;
  onSelect: () => void;
  onConnection: (connection: TDConnection | undefined) => void;
}): JSX.Element {
  const video = SceneClient.useVideo();
  // Published upward because the scene picker sits outside every scene provider
  // and still has to call this instance. Only reachable from in here.
  props.onConnection(SceneClient.useConnection());
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
            <SceneClient.Video stream="scene" />
            <Show when={video.streamStatus('scene') !== 'connected'}>
              <div class="video-overlay">{video.streamStatus('scene')}…</div>
            </Show>
          </button>
        )}
      </Show>
      <figcaption class="text-xs text-neutral-500">{props.label}</figcaption>
      <SceneClient.RangeInput name="level" min={0} max={1} step={0.01} readOnly />
      <fieldset>
        <label>CPU Cooktime </label>
        <SceneClient.Value name="cpuCookTime" format={(v) => `${Number(v).toFixed(1)}ms`} />
      </fieldset>
      {/* TODO: Table not getting data after load */}
      {/* <SceneClient.Table name="performance" header /> */}
    </figure>
  );
}
