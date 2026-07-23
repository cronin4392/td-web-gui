import { createMemo, onCleanup, Show, type JSX } from 'solid-js'
import { escapeNewlines } from 'td-core'
import { instances, sceneIdFromLoaderPath, sceneTextParam } from './td.config'
import { TDClient, type SceneTextParamName } from './td'
import { createTextSelectorStore } from './store'
import { TextField } from './components/TextField'
import { RecentRow } from './components/RecentRow'
import { TabStrip } from './components/TabStrip'
import { PhraseList } from './components/PhraseList'

const textSelector = instances[0]

export function App(): JSX.Element {
  const store = createTextSelectorStore()
  onCleanup(() => store.dispose())

  return (
    <main class="mx-auto max-w-2xl p-6">
      <TDClient.Provider url={textSelector.url} instance={textSelector.id}>
        <TextSelectorBody store={store} />
      </TDClient.Provider>
      <p class="mt-8 text-sm text-gray-700">
        Bound to instance <code>{textSelector.id}</code> at <code>{textSelector.url}</code>
      </p>
    </main>
  )
}

function TextSelectorBody(props: { store: ReturnType<typeof createTextSelectorStore> }): JSX.Element {
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = TDClient.useConnection()
  const selectedLoader = TDClient.signal('selectedLoader')

  /** Which loader's text params the fields are bound to, per TD's `selectedLoader`. */
  const activeScene = createMemo(() => sceneIdFromLoaderPath(selectedLoader.value()))

  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentRow/PhraseList (always Text 1).
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
          <p class="mt-4 text-sm text-gray-500">
            Waiting for a scene loader — <code>selectedLoader</code> is{' '}
            <TDClient.Value name="selectedLoader" />
          </p>
        }
      >
        {(scene) => (
          <section class="mt-4 flex flex-col gap-3">
            <h2 class="text-sm font-semibold text-gray-500">Scene {scene}</h2>
            <TextField
              name={sceneTextParam(scene, 1)}
              label="Text 1"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
            />
            <TextField
              name={sceneTextParam(scene, 2)}
              label="Text 2"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
            />
          </section>
        )}
      </Show>

      <section class="mt-4 border-t pt-3">
        <RecentRow recent={props.store.state.recent} onApply={applyToText1} onDelete={props.store.deleteRecent} />
      </section>

      <section class="mt-4 border-t pt-3">
        <TabStrip store={props.store} />
        <Show when={activeTab()}>{(tab) => <PhraseList store={props.store} tab={tab()} onApply={applyToText1} />}</Show>
      </section>
    </>
  )
}
