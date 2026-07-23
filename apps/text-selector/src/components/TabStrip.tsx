/**
 * Tab strip (TEXT_SELECTOR.md §3 "Tab strip"): activate, add, inline rename,
 * delete behind a confirm (disabled on the last tab), and drag-reorder — a
 * separate drag surface from phrase reordering (keyed on a different custom
 * mime, so a phrase dragged over the strip is never a valid drop here and
 * vice versa).
 *
 * Accessibility: `role="tablist"` / `role="tab"` / `aria-selected`, with
 * roving `tabIndex` and Left/Right arrow-key navigation between tabs.
 */

import { For, Show, createSignal, type JSX } from 'solid-js'
import type { TextSelectorStore } from '../store'
import { TAB_MIME, adjustReorderTarget, hasDragMime } from '../dnd'

export interface TabStripProps {
  store: TextSelectorStore
}

export function TabStrip(props: TabStripProps): JSX.Element {
  const { state } = props.store
  const [renamingId, setRenamingId] = createSignal<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null)
  const [dragIndex, setDragIndex] = createSignal<number | null>(null)
  const tabRefs = new Map<string, HTMLButtonElement>()

  function commitRename(id: string, value: string) {
    const trimmed = value.trim()
    if (trimmed) props.store.renameTab(id, trimmed)
    setRenamingId(null)
  }

  function onTabKeyDown(event: KeyboardEvent, index: number) {
    const tabs = state.tabs
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextIndex =
        event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length
      const next = tabs[nextIndex]
      if (!next) return
      props.store.setActiveTab(next.id)
      tabRefs.get(next.id)?.focus()
    }
  }

  return (
    <div role="tablist" aria-label="Phrase lists" class="flex flex-wrap items-center gap-1 border-b border-gray-200 pb-1">
      <For each={state.tabs}>
        {(tab, i) => (
          <div
            class="flex items-center rounded-t border border-b-0 border-transparent"
            classList={{ 'border-gray-300 bg-gray-50': dragIndex() === i() }}
            draggable={renamingId() !== tab.id}
            onDragStart={(event) => {
              event.dataTransfer?.setData(TAB_MIME, String(i()))
              setDragIndex(i())
            }}
            onDragOver={(event) => {
              if (!hasDragMime(event.dataTransfer!, TAB_MIME)) return
              event.preventDefault()
            }}
            onDrop={(event) => {
              if (!hasDragMime(event.dataTransfer!, TAB_MIME)) return
              event.preventDefault()
              const from = dragIndex()
              setDragIndex(null)
              if (from === null) return
              props.store.reorderTabs(from, adjustReorderTarget(from, i()))
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
                  aria-selected={state.activeTabId === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  tabIndex={state.activeTabId === tab.id ? 0 : -1}
                  onClick={() => props.store.setActiveTab(tab.id)}
                  onDblClick={() => setRenamingId(tab.id)}
                  onKeyDown={(event) => onTabKeyDown(event, i())}
                  classList={{
                    'font-semibold text-gray-900': state.activeTabId === tab.id,
                    'text-gray-500': state.activeTabId !== tab.id,
                  }}
                  class="px-2 py-1 text-sm"
                >
                  {tab.name}
                </button>
              }
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  commitRename(tab.id, (event.currentTarget.elements.namedItem('rename') as HTMLInputElement).value)
                }}
              >
                <input
                  name="rename"
                  ref={(el) => {
                    queueMicrotask(() => {
                      el.focus()
                      el.select()
                    })
                  }}
                  value={tab.name}
                  class="w-24 border px-1 py-0.5 text-sm"
                  onBlur={(event) => commitRename(tab.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenamingId(null)
                  }}
                />
              </form>
            </Show>

            <Show
              when={confirmDeleteId() === tab.id}
              fallback={
                <button
                  type="button"
                  aria-label={`Delete list "${tab.name}"`}
                  disabled={state.tabs.length <= 1}
                  onClick={() => setConfirmDeleteId(tab.id)}
                  class="px-1 text-xs text-gray-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              }
            >
              <span class="flex items-center gap-1 pl-1 text-xs">
                Delete?
                <button
                  type="button"
                  class="text-red-600"
                  onClick={() => {
                    props.store.deleteTab(tab.id)
                    setConfirmDeleteId(null)
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
        onClick={() => props.store.addTab()}
        class="px-2 py-1 text-sm font-semibold text-gray-500 hover:text-gray-900"
      >
        +
      </button>
    </div>
  )
}
