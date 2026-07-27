/**
 * App state + persistence (TEXT_SELECTOR.md §§2-3, 5).
 *
 * `createVjGuiStore()` is a factory (not a bare module singleton) so
 * tests can spin up isolated instances with a fake `persistence.save` /
 * `uiStorage`; the app itself owns exactly one instance for its lifetime.
 *
 * Persistence is split by what the data *is*, not stored in one blob:
 * `tabs`/`recent` are library content and go through `persistence.save` (the
 * SQLite-backed `/api/library`, via `saveLibrary()` in `library-api.ts`);
 * `activeTabId` is a per-browser UI preference and stays in `localStorage`.
 * Both share one debounce timer via two dirty flags, so switching tabs
 * writes `localStorage` without rewriting the library.
 */

import { createStore, unwrap } from 'solid-js/store';
import { defaultLibrary, type Library, type PhraseTab } from './library';

export type { PhraseTab };

const UI_STORAGE_KEY = 'td-web-gui:vj-gui:ui';
const RECENT_LIMIT = 10;
const DEFAULT_DEBOUNCE_MS = 200;

/** Pinned first entry in the tab strip, backed by `state.recent` rather than `state.tabs` — never a real tab id. */
export const RECENT_TAB_ID = '__recent__';

export interface AppState {
  tabs: PhraseTab[];
  recent: string[];
  activeTabId: string;
}

// ---- pure helpers ----------------------------------------------------------

function makeTab(name: string): PhraseTab {
  return { id: crypto.randomUUID(), name, phrases: [] };
}

/** Splice `arr[from]` out and reinsert it at `to` (post-removal index), returning a new array. */
function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1) as [T];
  next.splice(to, 0, moved);
  return next;
}

/** Move `item` to the front, deduping any existing match; `limit` caps the result (e.g. the recent list). */
function moveToFront(arr: readonly string[], item: string, limit?: number): string[] {
  const next = [item, ...arr.filter((p) => p !== item)];
  return limit === undefined ? next : next.slice(0, limit);
}

/** Move `item` to the back, deduping any existing match. */
function moveToBack(arr: readonly string[], item: string): string[] {
  return [...arr.filter((p) => p !== item), item];
}

/** The persisted `activeTabId` if it names one of `tabs` (or the pinned Recent tab); the first tab otherwise. Never throws. */
function loadActiveTabId(storage: Storage | undefined, tabs: readonly PhraseTab[]): string {
  const fallback = tabs[0]!.id;
  if (!storage) return fallback;
  try {
    const stored = storage.getItem(UI_STORAGE_KEY);
    if (stored === RECENT_TAB_ID) return stored;
    return stored !== null && tabs.some((t) => t.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

// ---- store ------------------------------------------------------------------

export interface CreateStoreOptions {
  /** Library hydrated before mount (e.g. via `fetchLibrary()`); defaults to a single empty `List 1` tab. */
  initial?: Library;
  /** Where library writes (tabs/phrases/recent) go. Omitted in tests that don't care about persistence. */
  persistence?: { save: (library: Library) => void | Promise<void> };
  /** Where `activeTabId` — UI state, not library content — is remembered. Defaults to `localStorage`. */
  uiStorage?: Storage;
  /** Debounce window for writes, in ms. Default 200. */
  debounceMs?: number;
}

export interface VjGuiStore {
  state: AppState;

  /** Feed a committed phrase (from either text input) into the recent list. */
  commitRecent: (phrase: string) => void;
  /** Remove a phrase from the recent list. */
  deleteRecent: (phrase: string) => void;

  /** Append a new `List N` tab and activate it; returns its id. */
  addTab: () => string;
  /** Rename a tab; a blank (post-trim) name is a no-op, leaving the old name. */
  renameTab: (id: string, name: string) => void;
  /** Delete a tab (no-op if it's the last one); reassigns the active tab if needed. */
  deleteTab: (id: string) => void;
  /** Also accepts `RECENT_TAB_ID`, selecting the pinned Recent tab. */
  setActiveTab: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  /** Add a phrase to the bottom of a tab's list; moves an existing match to the bottom instead of duplicating. */
  addPhrase: (tabId: string, phrase: string) => void;
  deletePhrase: (tabId: string, index: number) => void;
  reorderPhrase: (tabId: string, fromIndex: number, toIndex: number) => void;
  /** One-shot alphabetical sort (case-insensitive), persisted as the new manual order. */
  sortPhrases: (tabId: string) => void;

  /** Cancel any pending debounced write (e.g. on app teardown). */
  dispose: () => void;
}

export function createVjGuiStore(options: CreateStoreOptions = {}): VjGuiStore {
  const uiStorage =
    options.uiStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const library = options.initial ?? defaultLibrary();

  const [state, setState] = createStore<AppState>({
    tabs: library.tabs,
    recent: library.recent,
    activeTabId: loadActiveTabId(uiStorage, library.tabs),
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let libraryDirty = false;
  let uiDirty = false;
  let warnedWriteFailure = false;

  function scheduleSave() {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      flush();
    }, debounceMs);
  }

  function flush() {
    if (uiDirty) {
      uiDirty = false;
      writeUiStorage();
    }
    if (libraryDirty) {
      libraryDirty = false;
      void writeLibrary();
    }
  }

  function writeUiStorage() {
    if (!uiStorage) return;
    try {
      uiStorage.setItem(UI_STORAGE_KEY, state.activeTabId);
    } catch {
      // A UI preference, not library content — silently dropped on quota/private-mode failure.
    }
  }

  async function writeLibrary() {
    if (!options.persistence) return;
    try {
      await options.persistence.save({ tabs: unwrap(state.tabs), recent: unwrap(state.recent) });
    } catch (err) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        console.warn('[vj-gui] failed to persist library; continuing in-memory', err);
      }
    }
  }

  function markLibraryDirty() {
    libraryDirty = true;
    scheduleSave();
  }

  function markUiDirty() {
    uiDirty = true;
    scheduleSave();
  }

  function findTabIndex(id: string): number {
    return state.tabs.findIndex((t) => t.id === id);
  }

  function nextListName(): string {
    const used = new Set(state.tabs.map((t) => t.name));
    let n = 1;
    while (used.has(`List ${n}`)) n++;
    return `List ${n}`;
  }

  function commitRecent(phrase: string): void {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    setState('recent', (recent) => moveToFront(recent, trimmed, RECENT_LIMIT));
    markLibraryDirty();
  }

  function deleteRecent(phrase: string): void {
    setState('recent', (recent) => recent.filter((p) => p !== phrase));
    markLibraryDirty();
  }

  function addTab(): string {
    const tab = makeTab(nextListName());
    setState('tabs', (tabs) => [...tabs, tab]);
    setState('activeTabId', tab.id);
    markLibraryDirty();
    markUiDirty();
    return tab.id;
  }

  function renameTab(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return; // empty name reverts to the previous one (i.e. no-op)
    const idx = findTabIndex(id);
    if (idx === -1) return;
    setState('tabs', idx, 'name', trimmed);
    markLibraryDirty();
  }

  function deleteTab(id: string): void {
    if (state.tabs.length <= 1) return; // last-tab guard
    const idx = findTabIndex(id);
    if (idx === -1) return;
    const wasActive = state.activeTabId === id;

    setState('tabs', (tabs) => tabs.filter((t) => t.id !== id));

    if (wasActive) {
      // Left neighbour, or the new first tab if the deleted one was first.
      const newIdx = Math.min(Math.max(0, idx - 1), state.tabs.length - 1);
      const next = state.tabs[newIdx];
      if (next) {
        setState('activeTabId', next.id);
        markUiDirty();
      }
    }
    markLibraryDirty();
  }

  function setActiveTab(id: string): void {
    if (id !== RECENT_TAB_ID && findTabIndex(id) === -1) return;
    setState('activeTabId', id);
    markUiDirty(); // UI-only: does not touch the library, so no libraryDirty here.
  }

  function reorderTabs(fromIndex: number, toIndex: number): void {
    const { tabs } = state;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex < 0 ||
      toIndex >= tabs.length
    ) {
      return;
    }
    setState('tabs', (tabs) => moveItem(tabs, fromIndex, toIndex));
    markLibraryDirty();
  }

  function addPhrase(tabId: string, phrase: string): void {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    const idx = findTabIndex(tabId);
    if (idx === -1) return;
    setState('tabs', idx, 'phrases', (phrases) => moveToBack(phrases, trimmed));
    markLibraryDirty();
  }

  function deletePhrase(tabId: string, index: number): void {
    const idx = findTabIndex(tabId);
    if (idx === -1) return;
    setState('tabs', idx, 'phrases', (phrases) => phrases.filter((_, i) => i !== index));
    markLibraryDirty();
  }

  function reorderPhrase(tabId: string, fromIndex: number, toIndex: number): void {
    const idx = findTabIndex(tabId);
    if (idx === -1) return;
    const { phrases } = state.tabs[idx]!;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= phrases.length ||
      toIndex < 0 ||
      toIndex >= phrases.length
    ) {
      return;
    }
    setState('tabs', idx, 'phrases', (phrases) => moveItem(phrases, fromIndex, toIndex));
    markLibraryDirty();
  }

  function sortPhrases(tabId: string): void {
    const idx = findTabIndex(tabId);
    if (idx === -1) return;
    setState('tabs', idx, 'phrases', (phrases) =>
      [...phrases].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );
    markLibraryDirty();
  }

  function dispose(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
  }

  return {
    state,
    commitRecent,
    deleteRecent,
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
  };
}
