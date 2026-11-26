import { createMemo, createSignal, For, Match, Show, Switch, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { actTextList, isBlank } from '@domain/textstate/textstate';
import { usePlayback } from '@/playback/PlaybackProvider';
import { withSlot, type TextStateStore } from '@/textstate/store';
import { ShowInfoDialog } from '@/textstate/ShowInfoDialog';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { RECENT_TAB_ID, SHOW_TAB_ID, type WordbankStore } from '@/wordbank/store';
import { TextField } from './TextField';
import { RecentPanel } from './RecentPanel';
import { ShowPanel } from './ShowPanel';
import { TabStrip } from './TabStrip';
import { PhraseListPanel } from './PhraseListPanel';
import { SearchPanel } from './SearchPanel';
import { COLLAPSED_SLOTS, expandedSlots, isOverridden, reachedSlots } from './slots';
import styles from './TextPanel.module.css';

const slotLabel = (slot: number) => `Text ${slot + 1}`;

export function TextPanel(props: {
  wordbank: WordbankStore;
  textState: TextStateStore;
}): JSX.Element {
  const { selectedLayer } = usePlayback();

  const [query, setQuery] = createSignal('');
  const [showInfoOpen, setShowInfoOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [focusedSlot, setFocusedSlot] = createSignal<number | null>(null);
  // Pressing a chip blurs the field before its click lands, so the target slot is captured at mousedown.
  let pressedSlot: number | null = null;
  const holdEdit = () => (pressedSlot = focusedSlot());

  const actText = createMemo(() => actTextList(props.textState.state.show));
  const overridesOf = (layer: string) => props.textState.state.overrides[layer] ?? [];

  function visibleSlots(layer: string): number[] {
    const count = expanded()
      ? expandedSlots(actText().length, overridesOf(layer))
      : COLLAPSED_SLOTS;
    return Array.from({ length: count }, (_, i) => i);
  }
  function tabIntoHiddenSlot(event: KeyboardEvent, layer: string, fields: HTMLElement) {
    const slot = focusedSlot();
    const current = event.target;
    if (event.key !== 'Tab' || event.shiftKey || slot === null) return;
    if (!(current instanceof HTMLTextAreaElement)) return;
    const next = slot + 1;
    if (next < visibleSlots(layer).length) return;
    // The focused field's draft is only applied on blur, so count it as filled already.
    const withDraft = withSlot(overridesOf(layer), slot, current.value);
    if (next >= expandedSlots(actText().length, withDraft)) return;
    event.preventDefault();
    current.blur();
    setExpanded(true);
    fields.querySelectorAll('textarea')[next]?.focus();
  }

  function resetSearch() {
    pressedSlot = null;
    setQuery('');
  }
  function applyText(layer: string, slot: number, text: string) {
    props.textState.setOverride(layer, slot, isBlank(text) ? '' : escapeNewlines(text));
    props.wordbank.recordRecent(text);
    resetSearch();
  }
  function applyToFocused(text: string) {
    applyText(selectedLayer(), focusedSlot() ?? pressedSlot ?? 0, text);
  }
  function clearText(layer: string, slot: number) {
    props.textState.setOverride(layer, slot, '');
    resetSearch();
  }
  function clearOverrides(layer: string) {
    props.textState.clearOverrides(layer);
    resetSearch();
  }
  function endPick() {
    if (pressedSlot !== null) resetSearch();
  }
  function endEdit() {
    setFocusedSlot(null);
    if (pressedSlot === null) setQuery('');
  }

  const selectedList = createMemo(
    () =>
      props.wordbank.state.lists.find((l) => l.id === props.wordbank.state.selectedTabId) ??
      props.wordbank.state.lists[0],
  );

  const showTabTexts = createMemo(() => actText().map(unescapeNewlines));

  return (
    <div class={styles.panel}>
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
          <section
            class={styles.fields}
            onKeyDown={(event) => tabIntoHiddenSlot(event, layer, event.currentTarget)}
          >
            <For each={visibleSlots(layer)}>
              {(slot) => (
                <TextField
                  label={slotLabel(slot)}
                  value={overridesOf(layer)[slot] ?? ''}
                  placeholder={
                    (isOverridden(overridesOf(layer)) ? undefined : actText()[slot]) ??
                    slotLabel(slot)
                  }
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
            <div class={styles.fieldActions}>
              <Show
                when={
                  expanded() || reachedSlots(actText().length, overridesOf(layer)) > COLLAPSED_SLOTS
                }
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-expanded={expanded()}
                  class={styles.expand}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setExpanded((open) => !open)}
                >
                  {expanded() ? '▴ Fewer texts' : '▾ All texts'}
                </button>
              </Show>
              <button
                type="button"
                tabIndex={-1}
                class={styles.clearOverrides}
                onMouseDown={holdEdit}
                onClick={() => clearOverrides(layer)}
              >
                Clear overrides
              </button>
            </div>
          </section>
        )}
      </Show>

      <section class={styles.lists}>
        <TabStrip store={props.wordbank} />
        <div class={styles.body} onMouseDown={holdEdit} onClick={endPick}>
          <Switch>
            <Match when={query().trim() !== ''}>
              <SearchPanel store={props.wordbank} query={query()} onApply={applyToFocused} />
            </Match>
            <Match when={props.wordbank.state.selectedTabId === RECENT_TAB_ID}>
              <RecentPanel store={props.wordbank} onApply={applyToFocused} />
            </Match>
            <Match when={props.wordbank.state.selectedTabId === SHOW_TAB_ID}>
              <ShowPanel texts={showTabTexts()} onApply={applyToFocused} />
            </Match>
            <Match when={selectedList()}>
              {(list) => (
                <PhraseListPanel store={props.wordbank} list={list()} onApply={applyToFocused} />
              )}
            </Match>
          </Switch>
        </div>
      </section>
    </div>
  );
}
