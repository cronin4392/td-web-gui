import { createMemo, For, onCleanup, Show, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import {
  guiInstance,
  sceneInstances,
  sceneIdFromLoaderPath,
  sceneReadonly,
  sceneTextParam,
  type TDInstanceConfig,
} from './td.config';
import { GuiClient, SceneClient, type SceneTextParamName } from './td';
import { RECENT_TAB_ID, createVjGuiStore } from './store';
import { saveLibrary } from './library-api';
import type { Library } from './library';
import { TextField } from './components/TextField';
import { RecentPanel } from './components/RecentPanel';
import { TabStrip } from './components/TabStrip';
import { PhraseList } from './components/PhraseList';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchLibrary()`). */
  library: Library;
}

export function App(props: AppProps): JSX.Element {
  const store = createVjGuiStore({ initial: props.library, persistence: { save: saveLibrary } });
  onCleanup(() => store.dispose());

  return (
    <main class="flex h-screen flex-col px-2 pt-2">
      {/* Eight columns for the eight loaders this grows into; two are live. */}
      <div class="grid shrink-0 grid-cols-8 gap-2">
        <For each={sceneInstances}>{(scene) => <ScenePanel instance={scene} />}</For>
      </div>
      {/* The GUI project is a separate process from the scenes, so its params
          live behind their own provider — the text selector is the only thing
          bound to it. */}
      <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id}>
        <TextSelector store={store} />
      </GuiClient.Provider>
      {/* Hidden for now — re-enable by dropping the `hidden` class. */}
      <p class="mt-6 hidden shrink-0 text-sm text-neutral-500">
        Bound to{' '}
        {[guiInstance, ...sceneInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
      </p>
    </main>
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

function TextSelector(props: { store: ReturnType<typeof createVjGuiStore> }): JSX.Element {
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = GuiClient.useConnection();
  const selectedLoader = GuiClient.signal('selectedLoader');

  /** Which loader's text params the fields are bound to, per TD's `selectedLoader`. */
  const activeScene = createMemo(() => sceneIdFromLoaderPath(selectedLoader.value()));

  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentPanel/PhraseList (always Text 1).
  // This writes the signal directly, so it owes the same newline escaping the
  // multiline <TextInput> does on its own commits; stored phrases keep real
  // newlines.
  function applyPhrase(name: SceneTextParamName, phrase: string) {
    connection.signal(name).setValue(escapeNewlines(phrase));
    props.store.commitRecent(phrase);
  }
  function applyToText1(phrase: string) {
    const scene = activeScene();
    if (scene) applyPhrase(sceneTextParam(scene, 1), phrase);
  }
  function clearText(name: SceneTextParamName) {
    applyPhrase(name, '');
  }

  const activeTab = createMemo(
    () =>
      props.store.state.tabs.find((t) => t.id === props.store.state.activeTabId) ??
      props.store.state.tabs[0],
  );

  return (
    <>
      {/* `keyed` so switching loaders remounts the fields: <TextInput> binds its
          param name once at setup, so a changed `name` prop would not rebind. */}
      <Show
        when={activeScene()}
        keyed
        fallback={
          <p class="mt-4 shrink-0 text-sm text-neutral-500">
            Waiting for a scene loader — <code>selectedLoader</code> is{' '}
            <GuiClient.Value name="selectedLoader" />
          </p>
        }
      >
        {(scene) => (
          <section class="flex shrink-0 flex-col gap-1">
            <TextField
              name={sceneTextParam(scene, 1)}
              label="Artist name"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
            />
            <TextField
              name={sceneTextParam(scene, 2)}
              label="Event"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
            />
          </section>
        )}
      </Show>

      <section class="flex min-h-0 flex-1 flex-col pt-1">
        <TabStrip store={props.store} />
        <div class="min-h-0 flex-1 pt-2">
          <Show
            when={props.store.state.activeTabId !== RECENT_TAB_ID}
            fallback={<RecentPanel store={props.store} onApply={applyToText1} />}
          >
            <Show when={activeTab()}>
              {(tab) => <PhraseList store={props.store} tab={tab()} onApply={applyToText1} />}
            </Show>
          </Show>
        </div>
      </section>
    </>
  );
}
