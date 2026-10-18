import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { actTextList, isBlank } from '@domain/showinfo/showinfo';
import { usePlayback } from '@/playback/PlaybackProvider';
import type { ShowInfoStore } from '@/showinfo/store';
import { ShowInfoDialog } from '@/showinfo/ShowInfoDialog';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { RECENT_LIST_ID, SHOW_LIST_ID, type createWordbankStore } from './store';
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
  showInfo: ShowInfoStore;
}): JSX.Element {
  const { selectedLayer } = usePlayback();

  const [filter, setFilter] = createSignal('');
  const [showInfoOpen, setShowInfoOpen] = createSignal(false);
  const [focusedSlot, setFocusedSlot] = createSignal<Slot | null>(null);
  // Clicking a chip blurs the field before the click lands, so the target is
  // read at mousedown — while that field still has focus — and used by the
  // click that follows.
  let pressedSlot: Slot | null = null;

  const actTexts = createMemo(() => actTextList(props.showInfo.state.show));

  function applyPhrase(slot: Slot, phrase: string) {
    props.showInfo.setOverride(
      selectedLayer(),
      slot,
      isBlank(phrase) ? '' : escapeNewlines(phrase),
    );
    props.store.commitRecent(phrase);
  }
  function applyToFocused(phrase: string) {
    const slot = focusedSlot() ?? pressedSlot ?? 0;
    pressedSlot = null;
    applyPhrase(slot, phrase);
    setFilter('');
  }
  function clearText(slot: Slot) {
    props.showInfo.setOverride(selectedLayer(), slot, '');
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

  const showPhrases = createMemo(() => actTexts().map(unescapeNewlines));

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
        store={props.showInfo}
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
                  value={props.showInfo.state.overrides[layer]?.[slot] ?? ''}
                  placeholder={actTexts()[slot] ?? `Text ${slot + 1}`}
                  onCommit={(text) => applyPhrase(slot, text)}
                  onClear={() => clearText(slot)}
                  onFilter={setFilter}
                  onFocus={() => setFocusedSlot(slot)}
                  onBlur={endEdit}
                />
              )}
            </For>
            <button
              type="button"
              tabIndex={-1}
              class={styles.clearLayer}
              onClick={() => props.showInfo.clearOverrides(layer)}
            >
              Clear layer
            </button>
          </section>
        )}
      </Show>

      <section class={styles.lists}>
        <TabStrip store={props.store} />
        <div class={styles.body} onMouseDown={() => (pressedSlot = focusedSlot())}>
          <Show
            when={!filter().trim()}
            fallback={<SearchPanel store={props.store} query={filter()} onApply={applyToFocused} />}
          >
            <Show
              when={props.store.state.selectedListId !== RECENT_LIST_ID}
              fallback={<RecentPanel store={props.store} onApply={applyToFocused} />}
            >
              <Show
                when={props.store.state.selectedListId !== SHOW_LIST_ID}
                fallback={<ShowPanel phrases={showPhrases()} onApply={applyToFocused} />}
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
