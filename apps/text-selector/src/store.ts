/**
 * App state + persistence (TEXT_SELECTOR.md §§2-3, 5).
 *
 * `createTextSelectorStore()` is a factory (not a bare module singleton) so
 * tests can spin up isolated instances against a fake `Storage`; the app
 * itself owns exactly one instance for its lifetime.
 *
 * Every mutator ends by scheduling a debounced whole-document write — the
 * data is tiny and mutations are human-paced, so read-modify-write of the
 * entire blob on every change is correct and simple.
 */

import { createStore, unwrap } from 'solid-js/store'

const STORAGE_KEY = 'td-web-gui:text-selector'
const CURRENT_VERSION = 1
const RECENT_LIMIT = 10
const DEFAULT_DEBOUNCE_MS = 200

export interface PhraseTab {
  id: string
  name: string
  phrases: string[]
}

export interface StoredState {
  version: 1
  recent: string[]
  tabs: PhraseTab[]
  activeTabId: string
}

// ---- defaults / validation / load --------------------------------------

function makeTab(name: string): PhraseTab {
  return { id: crypto.randomUUID(), name, phrases: [] }
}

function defaultState(): StoredState {
  const tab = makeTab('List 1')
  return { version: CURRENT_VERSION, recent: [], tabs: [tab], activeTabId: tab.id }
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string')
}

function isPhraseTab(x: unknown): x is PhraseTab {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  return typeof t.id === 'string' && typeof t.name === 'string' && isStringArray(t.phrases)
}

function isStoredState(x: unknown): x is StoredState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  if (s.version !== CURRENT_VERSION) return false
  if (!isStringArray(s.recent)) return false
  if (!Array.isArray(s.tabs) || s.tabs.length === 0 || !s.tabs.every(isPhraseTab)) return false
  if (typeof s.activeTabId !== 'string') return false
  if (!(s.tabs as PhraseTab[]).some((t) => t.id === s.activeTabId)) return false
  return true
}

/** Splice `arr[from]` out and reinsert it at `to` (post-removal index), returning a new array. */
function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  const [moved] = next.splice(from, 1) as [T]
  next.splice(to, 0, moved)
  return next
}

/** Move `item` to the front, deduping any existing match; `limit` caps the result (e.g. the recent list). */
function moveToFront(arr: readonly string[], item: string, limit?: number): string[] {
  const next = [item, ...arr.filter((p) => p !== item)]
  return limit === undefined ? next : next.slice(0, limit)
}

/** Load + validate stored state; never throws — a bad entry falls back to defaults. */
export function loadState(storage: Storage): StoredState {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[text-selector] localStorage unavailable, using defaults', err)
    return defaultState()
  }
  if (!raw) return defaultState()
  try {
    const parsed = JSON.parse(raw)
    if (!isStoredState(parsed)) {
      console.warn('[text-selector] stored state failed validation, using defaults')
      return defaultState()
    }
    return parsed
  } catch (err) {
    console.warn('[text-selector] stored state is corrupt JSON, using defaults', err)
    return defaultState()
  }
}

// ---- store ---------------------------------------------------------------

export interface CreateStoreOptions {
  /** Defaults to `localStorage`; injectable for tests. */
  storage?: Storage
  /** Debounce window for writes, in ms. Default 200. */
  debounceMs?: number
}

export interface TextSelectorStore {
  state: StoredState

  /** Feed a committed phrase (from either text input) into the recent list. */
  commitRecent: (phrase: string) => void

  /** Append a new `List N` tab and activate it; returns its id. */
  addTab: () => string
  /** Rename a tab; a blank (post-trim) name is a no-op, leaving the old name. */
  renameTab: (id: string, name: string) => void
  /** Delete a tab (no-op if it's the last one); reassigns the active tab if needed. */
  deleteTab: (id: string) => void
  setActiveTab: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void

  /** Add a phrase to the top of a tab's list; moves an existing match to the top instead of duplicating. */
  addPhrase: (tabId: string, phrase: string) => void
  deletePhrase: (tabId: string, index: number) => void
  reorderPhrase: (tabId: string, fromIndex: number, toIndex: number) => void
  /** One-shot alphabetical sort (case-insensitive), persisted as the new manual order. */
  sortPhrases: (tabId: string) => void

  /** Cancel any pending debounced write (e.g. on app teardown). */
  dispose: () => void
}

export function createTextSelectorStore(options: CreateStoreOptions = {}): TextSelectorStore {
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS

  const [state, setState] = createStore<StoredState>(storage ? loadState(storage) : defaultState())

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let warnedWriteFailure = false

  function scheduleSave() {
    if (!storage) return
    if (saveTimer !== undefined) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(unwrap(state)))
      } catch (err) {
        if (!warnedWriteFailure) {
          warnedWriteFailure = true
          console.warn('[text-selector] failed to persist state; continuing in-memory', err)
        }
      }
    }, debounceMs)
  }

  function findTabIndex(id: string): number {
    return state.tabs.findIndex((t) => t.id === id)
  }

  function nextListName(): string {
    const used = new Set(state.tabs.map((t) => t.name))
    let n = 1
    while (used.has(`List ${n}`)) n++
    return `List ${n}`
  }

  function commitRecent(phrase: string): void {
    const trimmed = phrase.trim()
    if (!trimmed) return
    setState('recent', (recent) => moveToFront(recent, trimmed, RECENT_LIMIT))
    scheduleSave()
  }

  function addTab(): string {
    const tab = makeTab(nextListName())
    setState('tabs', (tabs) => [...tabs, tab])
    setState('activeTabId', tab.id)
    scheduleSave()
    return tab.id
  }

  function renameTab(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return // empty name reverts to the previous one (i.e. no-op)
    const idx = findTabIndex(id)
    if (idx === -1) return
    setState('tabs', idx, 'name', trimmed)
    scheduleSave()
  }

  function deleteTab(id: string): void {
    if (state.tabs.length <= 1) return // last-tab guard
    const idx = findTabIndex(id)
    if (idx === -1) return
    const wasActive = state.activeTabId === id

    setState('tabs', (tabs) => tabs.filter((t) => t.id !== id))

    if (wasActive) {
      // Left neighbour, or the new first tab if the deleted one was first.
      const newIdx = Math.min(Math.max(0, idx - 1), state.tabs.length - 1)
      const next = state.tabs[newIdx]
      if (next) setState('activeTabId', next.id)
    }
    scheduleSave()
  }

  function setActiveTab(id: string): void {
    if (findTabIndex(id) === -1) return
    setState('activeTabId', id)
    scheduleSave()
  }

  function reorderTabs(fromIndex: number, toIndex: number): void {
    const { tabs } = state
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= tabs.length || toIndex < 0 || toIndex >= tabs.length) {
      return
    }
    setState('tabs', (tabs) => moveItem(tabs, fromIndex, toIndex))
    scheduleSave()
  }

  function addPhrase(tabId: string, phrase: string): void {
    const trimmed = phrase.trim()
    if (!trimmed) return
    const idx = findTabIndex(tabId)
    if (idx === -1) return
    setState('tabs', idx, 'phrases', (phrases) => moveToFront(phrases, trimmed))
    scheduleSave()
  }

  function deletePhrase(tabId: string, index: number): void {
    const idx = findTabIndex(tabId)
    if (idx === -1) return
    setState('tabs', idx, 'phrases', (phrases) => phrases.filter((_, i) => i !== index))
    scheduleSave()
  }

  function reorderPhrase(tabId: string, fromIndex: number, toIndex: number): void {
    const idx = findTabIndex(tabId)
    if (idx === -1) return
    const { phrases } = state.tabs[idx]!
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= phrases.length ||
      toIndex < 0 ||
      toIndex >= phrases.length
    ) {
      return
    }
    setState('tabs', idx, 'phrases', (phrases) => moveItem(phrases, fromIndex, toIndex))
    scheduleSave()
  }

  function sortPhrases(tabId: string): void {
    const idx = findTabIndex(tabId)
    if (idx === -1) return
    setState('tabs', idx, 'phrases', (phrases) =>
      [...phrases].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    )
    scheduleSave()
  }

  function dispose(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
  }

  return {
    state,
    commitRecent,
    addTab,
    renameTab,
    deleteTab,
    setActiveTab,
    reorderTabs,
    addPhrase,
    deletePhrase,
    reorderPhrase,
    sortPhrases,
    dispose,
  }
}
