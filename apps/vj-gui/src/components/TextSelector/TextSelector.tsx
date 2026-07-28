import { createMemo, Show, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { sceneTextParam, type SceneId } from '@/td.config';
import { GuiClient, type SceneTextParamName } from '@/td';
import { RECENT_TAB_ID, type createVjGuiStore } from '@/store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { TabStrip } from './TabStrip';
import { PhraseList } from './PhraseList';

export function TextSelector(props: {
  store: ReturnType<typeof createVjGuiStore>;
  selectedLayer: SceneId;
}): JSX.Element {
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = GuiClient.useConnection();

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
    applyPhrase(sceneTextParam(props.selectedLayer, 1), phrase);
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
    <div>
      {/* `keyed` so switching loaders remounts the fields: <TextInput> binds its
          param name once at setup, so a changed `name` prop would not rebind. */}
      <Show when={props.selectedLayer} keyed>
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
    </div>
  );
}
