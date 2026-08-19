/**
 * Active tab's phrase list body (TEXT_SELECTOR.md §3 "List body"): inline add
 * form, draggable/reorderable phrase rows with a drop-indicator line, and the
 * one-shot A→Z sort. Filtering comes from the text fields above it.
 */

import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { PhraseList, WordbankStore } from './store';
import { adjustReorderTarget, dropIndexForRow, hasPhraseDragData, readPhraseDragData } from './dnd';
import { PhraseChip } from './PhraseChip';
import styles from './ListPanel.module.css';

export interface ListPanelProps {
  store: WordbankStore;
  list: PhraseList;
  /** Live text of whichever field is being typed in. */
  filter: string;
  onApply: (phrase: string) => void;
}

export function ListPanel(props: ListPanelProps): JSX.Element {
  const [adding, setAdding] = createSignal(false);
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);
  let addInputRef: HTMLTextAreaElement | undefined;

  const isFiltered = createMemo(() => props.filter.trim().length > 0);

  // Split so a filter keystroke only re-filters — it doesn't reallocate the
  // per-phrase objects, letting <For>'s identity-based diffing leave
  // unaffected rows (and their DOM) untouched.
  const indexed = createMemo(() => props.list.phrases.map((phrase, index) => ({ phrase, index })));
  const rows = createMemo(() => {
    const q = props.filter.trim().toLowerCase();
    return q ? indexed().filter((row) => row.phrase.toLowerCase().includes(q)) : indexed();
  });

  function toggleAdd() {
    if (adding()) {
      setAdding(false);
      return;
    }
    setAdding(true);
    queueMicrotask(() => addInputRef?.focus());
  }

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${props.list.id}`}
      aria-labelledby={`tab-${props.list.id}`}
      class={styles.panel}
    >
      <div class={styles.toolbar}>
        <button
          type="button"
          onClick={() => props.store.sortPhrases(props.list.id)}
          class={styles.action}
          title="Sort A→Z (one-time, persists as the new order)"
        >
          A→Z
        </button>
        <button
          type="button"
          aria-label={adding() ? 'Close add phrase' : 'Add a phrase'}
          aria-expanded={adding()}
          onClick={toggleAdd}
          class={`${styles.action} ${styles.actionBold}`}
        >
          +
        </button>
      </div>

      <Show when={adding()}>
        <form
          class={styles.addForm}
          onSubmit={(event) => {
            event.preventDefault();
            const value = addInputRef?.value ?? '';
            props.store.addPhrase(props.list.id, value);
            if (addInputRef) addInputRef.value = '';
            addInputRef?.focus();
          }}
        >
          <textarea
            ref={addInputRef}
            rows={2}
            placeholder="new phrase…"
            aria-label="New phrase"
            class={styles.addInput}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setAdding(false);
                return;
              }
              // A textarea raises no implicit submit; Enter commits here
              // (Shift+Enter still inserts a line break), matching
              // TextField/TDClient.TextInput's multiline commit behavior.
              if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </form>
      </Show>

      <ul class={styles.rows}>
        <For each={rows()}>
          {(row) => (
            <li
              class={styles.row}
              onDragOver={(event) => {
                if (isFiltered() || !hasPhraseDragData(event.dataTransfer!)) return;
                event.preventDefault();
                setDropIndex(dropIndexForRow(event, event.currentTarget, row.index));
              }}
              onDragLeave={() => setDropIndex(null)}
              onDrop={(event) => {
                setDropIndex(null);
                if (isFiltered()) return;
                const payload = readPhraseDragData(event.dataTransfer!);
                if (!payload) return;
                event.preventDefault();
                // No cross-tab moves in v1: reject a drop whose tabId isn't the active tab.
                if (
                  payload.source !== 'list' ||
                  payload.tabId !== props.list.id ||
                  payload.index === null
                )
                  return;
                const to = dropIndexForRow(event, event.currentTarget, row.index);
                props.store.reorderPhrase(
                  props.list.id,
                  payload.index,
                  adjustReorderTarget(payload.index, to),
                );
              }}
            >
              <Show when={dropIndex() === row.index}>
                <div class={styles.dropIndicator} />
              </Show>
              <PhraseChip
                phrase={row.phrase}
                source="list"
                tabId={props.list.id}
                index={row.index}
                onApply={props.onApply}
                onDelete={() => props.store.deletePhrase(props.list.id, row.index)}
              />
            </li>
          )}
        </For>
        <Show when={rows().length === 0}>
          <li class={styles.empty}>
            {isFiltered() ? 'No phrases match.' : 'No phrases yet — add one above.'}
          </li>
        </Show>
      </ul>
    </div>
  );
}
