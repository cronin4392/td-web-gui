import { For, Show, type JSX } from 'solid-js';
import { sceneInstances, sceneReadonly, type TDInstanceConfig } from '../td.config';
import { SceneClient } from '../td';

export function ScenePreviews(): JSX.Element {
  return (
    <div class="grid shrink-0 grid-cols-8 gap-2">
      <For each={sceneInstances}>{(scene) => <ScenePanel instance={scene} />}</For>
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
function ScenePanel(props: { instance: TDInstanceConfig }): JSX.Element {
  return (
    <SceneClient.Provider
      url={props.instance.url}
      instance={props.instance.id}
      video={true}
      readonly={[...sceneReadonly]}
    >
      <SceneBody label={props.instance.id} />
    </SceneClient.Provider>
  );
}

/**
 * The same markup for every scene — its names come from the one `SceneParams`
 * schema, and the provider above decides which process answers them.
 */
function SceneBody(props: { label: string }): JSX.Element {
  const video = SceneClient.useVideo();
  return (
    <figure class="m-0">
      <Show when={video.stream('scene')} keyed>
        {(_stream) => (
          <div class="video-tile">
            <SceneClient.Video stream="scene" />
            <Show when={video.streamStatus('scene') !== 'connected'}>
              <div class="video-overlay">{video.streamStatus('scene')}…</div>
            </Show>
          </div>
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
