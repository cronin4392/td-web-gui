import { createMemo, createSignal, Show, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { layerTextParam } from '@/playback/wire';
import { GuiClient, type LayerTextParamName } from '@/playback/clients';
import { usePlayback } from '@/playback/PlaybackProvider';
import { RECENT_LIST_ID, type createWordbankStore } from './store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { TabStrip } from './TabStrip';
import { ListPanel } from './ListPanel';
import styles from './TextSelector.module.css';

export function TextSelector(props: {
  store: ReturnType<typeof createWordbankStore>;
}): JSX.Element {
  const { selectedLayer } = usePlayback();
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = GuiClient.useConnection();

  // Typing in either text field filters the phrase lists below it, and a
  // clicked phrase lands in the field that is focused — Text 1 if none is.
  const [filter, setFilter] = createSignal('');
  // A slot rather than a param name, so it survives a layer change.
  const [focusedSlot, setFocusedSlot] = createSignal<1 | 2 | null>(null);
  // Clicking a chip blurs the field before the click lands, so the target is
  // read at mousedown — while that field still has focus — and used by the
  // click that follows.
  let pressedSlot: 1 | 2 | null = null;

  // The one place that owns "commit a phrase to a TD text field" — shared by
  // TextField's own drop target and RecentPanel/ListPanel's click-to-apply.
  // This writes the signal directly, so it owes the same newline escaping the
  // multiline <TextInput> does on its own commits; stored phrases keep real
  // newlines.
  function applyPhrase(name: LayerTextParamName, phrase: string) {
    connection.signal(name).setValue(escapeNewlines(phrase));
    props.store.commitRecent(phrase);
  }
  function applyToFocused(phrase: string) {
    const slot = focusedSlot() ?? pressedSlot ?? 1;
    pressedSlot = null;
    applyPhrase(layerTextParam(selectedLayer(), slot), phrase);
    setFilter('');
  }
  function clearText(name: LayerTextParamName) {
    applyPhrase(name, '');
    setFilter('');
  }
  function endEdit() {
    setFocusedSlot(null);
    setFilter('');
  }

  const selectedList = createMemo(
    () =>
      props.store.state.lists.find((l) => l.id === props.store.state.selectedListId) ??
      props.store.state.lists[0],
  );

  return (
    <div class={styles.selector}>
      {/* `keyed` so switching loaders remounts the fields: <TextInput> binds its
          param name once at setup, so a changed `name` prop would not rebind. */}
      <Show when={selectedLayer()} keyed>
        {(layer) => (
          <section class={styles.fields}>
            <TextField
              name={layerTextParam(layer, 1)}
              label="Artist name"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
              onFilter={setFilter}
              onFocus={() => setFocusedSlot(1)}
              onBlur={endEdit}
            />
            <TextField
              name={layerTextParam(layer, 2)}
              label="Event"
              commitRecent={props.store.commitRecent}
              applyPhrase={applyPhrase}
              onClear={clearText}
              onFilter={setFilter}
              onFocus={() => setFocusedSlot(2)}
              onBlur={endEdit}
            />
          </section>
        )}
      </Show>

      <section class={styles.lists}>
        <TabStrip store={props.store} />
        <div class={styles.body} onMouseDown={() => (pressedSlot = focusedSlot())}>
          <Show
            when={props.store.state.selectedListId !== RECENT_LIST_ID}
            fallback={
              <RecentPanel store={props.store} filter={filter()} onApply={applyToFocused} />
            }
          >
            <Show when={selectedList()}>
              {(list) => (
                <ListPanel
                  store={props.store}
                  list={list()}
                  filter={filter()}
                  onApply={applyToFocused}
                />
              )}
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
