import { createMemo, onCleanup, Show, type JSX } from 'solid-js'
import { instances } from './td.config'
import { TDClient, type TextSelectorParamName } from './td'
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
      <h1 class="text-xl font-semibold">td-web-gui · text selector</h1>
      <p class="mt-1 text-sm text-gray-500">
        Bound to instance <code>{textSelector.id}</code> at <code>{textSelector.url}</code>
      </p>

      <TDClient.Provider url={textSelector.url} instance={textSelector.id}>
        <TextSelectorBody store={store} />
      </TDClient.Provider>
    </main>
  )
}

function TextSelectorBody(props: { store: ReturnType<typeof createTextSelectorStore> }): JSX.Element {
  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentRow/PhraseList (always Text 1).
  function applyPhrase(name: TextSelectorParamName, phrase: string) {
    TDClient.signal(name).setValue(phrase)
    props.store.commitRecent(phrase)
  }
  const applyToText1 = (phrase: string) => applyPhrase('text1', phrase)

  const activeTab = createMemo(
    () => props.store.state.tabs.find((t) => t.id === props.store.state.activeTabId) ?? props.store.state.tabs[0],
  )

  return (
    <>
      <section class="mt-4 flex flex-col gap-3">
        <TextField name="text1" label="Text 1" commitRecent={props.store.commitRecent} applyPhrase={applyPhrase} />
        <TextField name="text2" label="Text 2" commitRecent={props.store.commitRecent} applyPhrase={applyPhrase} />
      </section>

      <section class="mt-4 border-t pt-3">
        <RecentRow recent={props.store.state.recent} onApply={applyToText1} />
      </section>

      <section class="mt-4 border-t pt-3">
        <TabStrip store={props.store} />
        <Show when={activeTab()}>{(tab) => <PhraseList store={props.store} tab={tab()} onApply={applyToText1} />}</Show>
      </section>
    </>
  )
}
