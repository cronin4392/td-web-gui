import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { actTextList, isBlank } from '@domain/textstate/textstate';
import { usePlayback } from '@/playback/PlaybackProvider';
import type { TextStateStore } from '@/textstate/store';
import { ShowInfoDialog } from '@/textstate/ShowInfoDialog';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { RECENT_LIST_ID, SHOW_TAB_ID, type createWordbankStore } from './store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { ShowPanel } from './ShowPanel';
import { TabStrip } from './TabStrip';
import { ListPanel } from './ListPanel';
import { SearchPanel } from './SearchPanel';
import styles from './TextSelector.module.css';

const SLOTS = [0, 1] as const;
type Slot = (typeof SLOTS)[number];

export function TextSelector(props: {
  store: ReturnType<typeof createWordbankStore>;
  textState: TextStateStore;
}): JSX.Element {
  const { selectedLayer } = usePlayback();

  const [filter, setFilter] = createSignal('');
  const [showInfoOpen, setShowInfoOpen] = createSignal(false);
  const [focusedSlot, setFocusedSlot] = createSignal<Slot | null>(null);
  // Pressing a chip blurs the field before the click lands, so the target is
  // read at mousedown — while that field still has focus — and the blur keeps
  // the search open for the click that follows instead of applying the query.
  let pressedSlot: Slot | null = null;
  const holdEdit = () => (pressedSlot = focusedSlot());

  const actTexts = createMemo(() => actTextList(props.textState.state.show));

  function endPick() {
    pressedSlot = null;
    setFilter('');
  }
  function applyText(layer: string, slot: Slot, text: string) {
    props.textState.setOverride(layer, slot, isBlank(text) ? '' : escapeNewlines(text));
    props.store.recordRecent(text);
    endPick();
  }
  function applyToFocused(text: string) {
    applyText(selectedLayer(), focusedSlot() ?? pressedSlot ?? 0, text);
  }
  function clearText(layer: string, slot: Slot) {
    props.textState.setOverride(layer, slot, '');
    endPick();
  }
  function clearOverrides(layer: string) {
    props.textState.clearOverrides(layer);
    endPick();
  }
  function endEdit() {
    setFocusedSlot(null);
    if (pressedSlot === null) setFilter('');
  }

  const selectedList = createMemo(
    () =>
      props.store.state.lists.find((l) => l.id === props.store.state.selectedListId) ??
      props.store.state.lists[0],
  );

  const showTabTexts = createMemo(() => actTexts().map(unescapeNewlines));

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
                  placeholder={actTexts()[slot] ?? `Text ${slot + 1}`}
                  onApply={(text) => applyText(layer, slot, text)}
                  onClear={() => clearText(layer, slot)}
                  onFilter={setFilter}
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
            if (pressedSlot !== null) endPick();
          }}
        >
          <Show
            when={!filter().trim()}
            fallback={<SearchPanel store={props.store} query={filter()} onApply={applyToFocused} />}
          >
            <Show
              when={props.store.state.selectedListId !== RECENT_LIST_ID}
              fallback={<RecentPanel store={props.store} onApply={applyToFocused} />}
            >
              <Show
                when={props.store.state.selectedListId !== SHOW_TAB_ID}
                fallback={<ShowPanel texts={showTabTexts()} onApply={applyToFocused} />}
              >
                <Show when={selectedList()}>
                  {(list) => (
                    <ListPanel store={props.store} list={list()} onApply={applyToFocused} />
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
