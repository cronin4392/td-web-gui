import { For, Show, createSignal, type JSX } from 'solid-js';
import { RECENT_LIST_ID, type WordbankStore } from './store';
import { TAB_MIME } from './dnd';
import { createContextMenu, type MenuItems } from '@/ui/ContextMenu';
import { adjustReorderTarget, hasDragMime } from '@/ui/dnd';
import styles from './TabStrip.module.css';

export interface TabStripProps {
  store: WordbankStore;
}

export function TabStrip(props: TabStripProps): JSX.Element {
  const { state } = props.store;
  const [renamingId, setRenamingId] = createSignal<string | null>(null);
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const tabRefs = new Map<string, HTMLButtonElement>();
  const menu = createContextMenu();

  function commitRename(id: string, value: string) {
    const trimmed = value.trim();
    if (trimmed) props.store.renameList(id, trimmed);
    setRenamingId(null);
  }

  function tabMenu(id: string): MenuItems {
    return [
      { label: 'Rename', onSelect: () => setRenamingId(id) },
      {
        label: 'Delete',
        danger: true,
        // The store refuses to drop the last list; say so here rather than
        // offering an action that quietly does nothing.
        disabled: state.lists.length <= 1,
        onSelect: () => props.store.deleteList(id),
      },
    ];
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

  const tabClass = (id: string) =>
    `${styles.tab} ${state.selectedListId === id ? styles.tabSelected : ''}`;

  return (
    <div role="tablist" aria-label="Phrase lists" class={styles.strip}>
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
        class={tabClass(RECENT_LIST_ID)}
      >
        Recent
      </button>

      <For each={state.lists}>
        {(tab, i) => (
          <div
            class={`${styles.tabSlot} ${dragIndex() === i() ? styles.tabSlotDragging : ''}`}
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
            onContextMenu={(event) => menu.open(event, tabMenu(tab.id))}
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
                  onKeyDown={(event) => onTabKeyDown(event, tab.id)}
                  class={tabClass(tab.id)}
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
                  class={styles.rename}
                  onBlur={(event) => commitRename(tab.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                />
              </form>
            </Show>
          </div>
        )}
      </For>
      <button
        type="button"
        aria-label="Add a new list"
        onClick={() => props.store.addList()}
        class={styles.add}
      >
        +
      </button>

      {menu.element}
    </div>
  );
}
