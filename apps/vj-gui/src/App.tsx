import { createMemo, onCleanup, Show, type JSX } from 'solid-js'
import { escapeNewlines } from 'td-core'
import { instances, sceneIdFromLoaderPath, sceneTextParam } from './td.config'
import { TDClient, type SceneTextParamName } from './td'
import { RECENT_TAB_ID, createVjGuiStore } from './store'
import { saveLibrary } from './library-api'
import type { Library } from './library'
import { TextField } from './components/TextField'
import { RecentPanel } from './components/RecentPanel'
import { TabStrip } from './components/TabStrip'
import { PhraseList } from './components/PhraseList'

const vjGui = instances[0]

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchLibrary()`). */
  library: Library
}

export function App(props: AppProps): JSX.Element {
  const store = createVjGuiStore({ initial: props.library, persistence: { save: saveLibrary } })
  onCleanup(() => store.dispose())

  return (
    <main class="flex h-screen flex-col px-2 pt-2">
      <TDClient.Provider url={vjGui.url} instance={vjGui.id}>
        <VjGuiBody store={store} />
      </TDClient.Provider>
      {/* Hidden for now — re-enable by dropping the `hidden` class. */}
      <p class="mt-6 hidden shrink-0 text-sm text-neutral-500">
        Bound to instance <code>{vjGui.id}</code> at <code>{vjGui.url}</code>
      </p>
    </main>
  )
}

function VjGuiBody(props: { store: ReturnType<typeof createVjGuiStore> }): JSX.Element {
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = TDClient.useConnection()
  const selectedLoader = TDClient.signal('selectedLoader')

  /** Which loader's text params the fields are bound to, per TD's `selectedLoader`. */
  const activeScene = createMemo(() => sceneIdFromLoaderPath(selectedLoader.value()))

  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentPanel/PhraseList (always Text 1).
  // This writes the signal directly, so it owes the same newline escaping the
  // multiline <TextInput> does on its own commits; stored phrases keep real
  // newlines.
  function applyPhrase(name: SceneTextParamName, phrase: string) {
    connection.signal(name).setValue(escapeNewlines(phrase))
    props.store.commitRecent(phrase)
  }
  function applyToText1(phrase: string) {
    const scene = activeScene()
    if (scene) applyPhrase(sceneTextParam(scene, 1), phrase)
  }
  function clearText(name: SceneTextParamName) {
    applyPhrase(name, '')
  }

  const activeTab = createMemo(
    () => props.store.state.tabs.find((t) => t.id === props.store.state.activeTabId) ?? props.store.state.tabs[0],
  )

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
            <TDClient.Value name="selectedLoader" />
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
            <Show when={activeTab()}>{(tab) => <PhraseList store={props.store} tab={tab()} onApply={applyToText1} />}</Show>
          </Show>
        </div>
      </section>
    </>
  )
}
