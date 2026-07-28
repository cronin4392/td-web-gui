import { createMemo, Show, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { layerTextParam } from '@/playback/wire';
import { GuiClient, type LayerTextParamName } from '@/playback/clients';
import { usePlayback } from '@/playback/PlaybackProvider';
import { RECENT_LIST_ID, type createWordbankStore } from './store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { TabStrip } from './TabStrip';
import { ListPanel } from './ListPanel';

export function TextSelector(props: {
  store: ReturnType<typeof createWordbankStore>;
}): JSX.Element {
  const { selectedLayer } = usePlayback();
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = GuiClient.useConnection();

  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentPanel/ListPanel (always Text 1).
  // This writes the signal directly, so it owes the same newline escaping the
  // multiline <TextInput> does on its own commits; stored phrases keep real
  // newlines.
  function applyPhrase(name: LayerTextParamName, phrase: string) {
    connection.signal(name).setValue(escapeNewlines(phrase));
    props.store.commitRecent(phrase);
  }
  function applyToText1(phrase: string) {
    applyPhrase(layerTextParam(selectedLayer(), 1), phrase);
  }
  function clearText(name: LayerTextParamName) {
    applyPhrase(name, '');
  }

  const selectedList = createMemo(
    () =>
      props.store.state.lists.find((l) => l.id === props.store.state.selectedListId) ??
      props.store.state.lists[0],
  );

  return (
    <div>
      {/* `keyed` so switching loaders remounts the fields: <TextInput> binds its
          param name once at setup, so a changed `name` prop would not rebind. */}
      <Show when={selectedLayer()} keyed>
        {(layer) => (
          <section class="flex shrink-0 flex-col gap-1">
            <TextField
              name={layerTextParam(layer, 1)}
              label="Artist name"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
            />
            <TextField
              name={layerTextParam(layer, 2)}
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
            when={props.store.state.selectedListId !== RECENT_LIST_ID}
            fallback={<RecentPanel store={props.store} onApply={applyToText1} />}
          >
            <Show when={selectedList()}>
              {(list) => <ListPanel store={props.store} list={list()} onApply={applyToText1} />}
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
