/**
 * Tab strip (TEXT_SELECTOR.md §3 "Tab strip"): a pinned "Recent" tab first,
 * backed by `store.state.recent` rather than `store.state.lists` — no
 * rename/delete/drag-reorder for it — followed by the user's phrase-list
 * tabs: activate, add, inline rename, delete behind a confirm (disabled on
 * the last tab), and drag-reorder — a separate drag surface from phrase
 * reordering (keyed on a different custom mime, so a phrase dragged over the
 * strip is never a valid drop here and vice versa).
 *
 * Accessibility: `role="tablist"` / `role="tab"` / `aria-selected`, with
 * roving `tabIndex` and Left/Right arrow-key navigation across all tabs,
 * pinned one included.
 */

import { For, Show, createSignal, type JSX } from 'solid-js';
import { RECENT_LIST_ID, type WordbankStore } from './store';
import { TAB_MIME, adjustReorderTarget, hasDragMime } from './dnd';

export interface TabStripProps {
  store: WordbankStore;
}

export function TabStrip(props: TabStripProps): JSX.Element {
  const { state } = props.store;
  const [renamingId, setRenamingId] = createSignal<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const tabRefs = new Map<string, HTMLButtonElement>();

  function commitRename(id: string, value: string) {
    const trimmed = value.trim();
    if (trimmed) props.store.renameList(id, trimmed);
    setRenamingId(null);
  }

  function onTabKeyDown(event: KeyboardEvent, id: string) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const ids = [RECENT_LIST_ID, ...state.lists.map((t) => t.id)];
    const index = ids.indexOf(id);
    const nextIndex =
      event.key === 'ArrowRight' ? (index + 1) % ids.length : (index - 1 + ids.length) % ids.length;
    const next = ids[nextIndex];
    if (!next) return;
    props.store.selectList(next);
    tabRefs.get(next)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Phrase lists"
      class="flex shrink-0 flex-wrap items-center gap-1 border-b border-neutral-700 pb-1"
    >
      <button
        ref={(el) => tabRefs.set(RECENT_LIST_ID, el)}
        type="button"
        role="tab"
        id={`tab-${RECENT_LIST_ID}`}
        aria-selected={state.selectedListId === RECENT_LIST_ID}
        aria-controls={`tabpanel-${RECENT_LIST_ID}`}
        tabIndex={state.selectedListId === RECENT_LIST_ID ? 0 : -1}
        onClick={() => props.store.selectList(RECENT_LIST_ID)}
        onKeyDown={(event) => onTabKeyDown(event, RECENT_LIST_ID)}
        classList={{
          'font-semibold text-white': state.selectedListId === RECENT_LIST_ID,
          'text-neutral-400': state.selectedListId !== RECENT_LIST_ID,
        }}
        class="px-2 py-1 text-sm"
      >
        Recent
      </button>

      <For each={state.lists}>
        {(tab, i) => (
          <div
            class="flex items-center rounded-t border border-b-0 border-transparent"
            classList={{ 'border-neutral-600 bg-neutral-800': dragIndex() === i() }}
            draggable={renamingId() !== tab.id}
            onDragStart={(event) => {
              event.dataTransfer?.setData(TAB_MIME, String(i()));
              setDragIndex(i());
            }}
            onDragOver={(event) => {
              if (!hasDragMime(event.dataTransfer!, TAB_MIME)) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!hasDragMime(event.dataTransfer!, TAB_MIME)) return;
              event.preventDefault();
              const from = dragIndex();
              setDragIndex(null);
              if (from === null) return;
              props.store.reorderLists(from, adjustReorderTarget(from, i()));
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <Show
              when={renamingId() === tab.id}
              fallback={
                <button
                  ref={(el) => tabRefs.set(tab.id, el)}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={state.selectedListId === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  tabIndex={state.selectedListId === tab.id ? 0 : -1}
                  onClick={() => props.store.selectList(tab.id)}
                  onDblClick={() => setRenamingId(tab.id)}
                  onKeyDown={(event) => onTabKeyDown(event, tab.id)}
                  classList={{
                    'font-semibold text-white': state.selectedListId === tab.id,
                    'text-neutral-400': state.selectedListId !== tab.id,
                  }}
                  class="px-2 py-1 text-sm"
                >
                  {tab.name}
                </button>
              }
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  commitRename(
                    tab.id,
                    (event.currentTarget.elements.namedItem('rename') as HTMLInputElement).value,
                  );
                }}
              >
                <input
                  name="rename"
                  ref={(el) => {
                    queueMicrotask(() => {
                      el.focus();
                      el.select();
                    });
                  }}
                  value={tab.name}
                  class="w-24 border border-neutral-600 bg-neutral-800 px-1 py-0.5 text-sm text-neutral-100"
                  onBlur={(event) => commitRename(tab.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                />
              </form>
            </Show>

            <Show
              when={confirmDeleteId() === tab.id}
              fallback={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Delete list "${tab.name}"`}
                  disabled={state.lists.length <= 1}
                  onClick={() => setConfirmDeleteId(tab.id)}
                  // Hidden for now — re-enable when tab deletion comes back.
                  class="hidden px-1 text-xs text-neutral-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              }
            >
              <span class="flex items-center gap-1 pl-1 text-xs">
                Delete?
                <button
                  type="button"
                  tabIndex={-1}
                  class="text-red-400"
                  onClick={() => {
                    props.store.deleteList(tab.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  Yes
                </button>
                <button type="button" onClick={() => setConfirmDeleteId(null)}>
                  No
                </button>
              </span>
            </Show>
          </div>
        )}
      </For>
      <button
        type="button"
        aria-label="Add a new list"
        onClick={() => props.store.addList()}
        class="px-2 py-1 text-sm font-semibold text-neutral-400 hover:text-white"
      >
        +
      </button>
    </div>
  );
}
