import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { actTextList, isBlank } from '@domain/textstate/textstate';
import { usePlayback } from '@/playback/PlaybackProvider';
import type { TextStateStore } from '@/textstate/store';
import { ShowInfoDialog } from '@/textstate/ShowInfoDialog';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { RECENT_TAB_ID, SHOW_TAB_ID, type createWordbankStore } from '@/wordbank/store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { ShowPanel } from './ShowPanel';
import { TabStrip } from './TabStrip';
import { PhraseListPanel } from './PhraseListPanel';
import { SearchPanel } from './SearchPanel';
import styles from './TextPanel.module.css';

const SLOTS = [0, 1] as const;
type Slot = (typeof SLOTS)[number];

export function TextPanel(props: {
  store: ReturnType<typeof createWordbankStore>;
  textState: TextStateStore;
}): JSX.Element {
  const { selectedLayer } = usePlayback();

  const [query, setQuery] = createSignal('');
  const [showInfoOpen, setShowInfoOpen] = createSignal(false);
  const [focusedSlot, setFocusedSlot] = createSignal<Slot | null>(null);
  // Pressing a chip blurs the field before the click lands, so the target is
  // read at mousedown — while that field still has focus — and the blur keeps
  // the search open for the click that follows instead of applying the query.
  let pressedSlot: Slot | null = null;
  const holdEdit = () => (pressedSlot = focusedSlot());

  const actText = createMemo(() => actTextList(props.textState.state.show));

  function resetSearch() {
    pressedSlot = null;
    setQuery('');
  }
  function applyText(layer: string, slot: Slot, text: string) {
    props.textState.setOverride(layer, slot, isBlank(text) ? '' : escapeNewlines(text));
    props.store.recordRecent(text);
    resetSearch();
  }
  function applyToFocused(text: string) {
    applyText(selectedLayer(), focusedSlot() ?? pressedSlot ?? 0, text);
  }
  function clearText(layer: string, slot: Slot) {
    props.textState.setOverride(layer, slot, '');
    resetSearch();
  }
  function clearOverrides(layer: string) {
    props.textState.clearOverrides(layer);
    resetSearch();
  }
  function endEdit() {
    setFocusedSlot(null);
    if (pressedSlot === null) setQuery('');
  }

  const selectedList = createMemo(
    () =>
      props.store.state.lists.find((l) => l.id === props.store.state.selectedTabId) ??
      props.store.state.lists[0],
  );

  const showTabTexts = createMemo(() => actText().map(unescapeNewlines));

  return (
    <div class={styles.selector}>
      <PanelHeader title="Text">
        <PanelHeaderButton
          label="Show info"
          pressed={showInfoOpen()}
          onClick={() => setShowInfoOpen(true)}
        >
          ⓘ
        </PanelHeaderButton>
      </PanelHeader>
      <ShowInfoDialog
        store={props.textState}
        open={showInfoOpen()}
        onClose={() => setShowInfoOpen(false)}
      />

      {/* `keyed` so switching layers remounts the fields and drops any draft. */}
      <Show when={selectedLayer()} keyed>
        {(layer) => (
          <section class={styles.fields}>
            <For each={SLOTS}>
              {(slot) => (
                <TextField
                  label={`Text ${slot + 1}`}
                  value={props.textState.state.overrides[layer]?.[slot] ?? ''}
                  placeholder={actText()[slot] ?? `Text ${slot + 1}`}
                  onApply={(text) => applyText(layer, slot, text)}
                  onClear={() => clearText(layer, slot)}
                  onSearch={setQuery}
                  onFocus={() => {
                    pressedSlot = null;
                    setFocusedSlot(slot);
                  }}
                  onBlur={endEdit}
                  isPicking={() => pressedSlot !== null}
                />
              )}
            </For>
            <button
              type="button"
              tabIndex={-1}
              class={styles.clearOverrides}
              onMouseDown={holdEdit}
              onClick={() => clearOverrides(layer)}
            >
              Clear overrides
            </button>
          </section>
        )}
      </Show>

      <section class={styles.lists}>
        <TabStrip store={props.store} />
        <div
          class={styles.body}
          onMouseDown={holdEdit}
          onClick={() => {
            if (pressedSlot !== null) resetSearch();
          }}
        >
          <Show
            when={!query().trim()}
            fallback={<SearchPanel store={props.store} query={query()} onApply={applyToFocused} />}
          >
            <Show
              when={props.store.state.selectedTabId !== RECENT_TAB_ID}
              fallback={<RecentPanel store={props.store} onApply={applyToFocused} />}
            >
              <Show
                when={props.store.state.selectedTabId !== SHOW_TAB_ID}
                fallback={<ShowPanel texts={showTabTexts()} onApply={applyToFocused} />}
              >
                <Show when={selectedList()}>
                  {(list) => (
                    <PhraseListPanel store={props.store} list={list()} onApply={applyToFocused} />
                  )}
                </Show>
              </Show>
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
