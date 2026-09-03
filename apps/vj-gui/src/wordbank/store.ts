/**
 * App state + persistence (TEXT_SELECTOR.md §§2-3, 5).
 *
 * `createWordbankStore()` is a factory (not a bare module singleton) so
 * tests can spin up isolated instances with a fake `persistence.save` /
 * `uiStorage`; the app itself owns exactly one instance for its lifetime.
 *
 * Persistence is split by what the data *is*, not stored in one blob:
 * `lists`/`recent` are wordbank content and go through `persistence.save` (the
 * SQLite-backed `/api/wordbank`, via `saveWordbank()` in `wordbank-api.ts`);
 * `selectedListId` is a per-browser UI preference and stays in `localStorage`.
 * Both share one debounce timer via two dirty flags, so switching lists
 * writes `localStorage` without rewriting the wordbank.
 */

import { createStore, unwrap } from 'solid-js/store';
import { defaultWordbank, type PhraseList, type Wordbank } from '@domain/wordbank/wordbank';
import { moveItem } from '@/ui/dnd';

export type { PhraseList };

const UI_STORAGE_KEY = 'td-web-gui:vj-gui:wordbank';
const RECENT_LIMIT = 10;
const DEFAULT_DEBOUNCE_MS = 200;

/** Pinned first entry in the tab strip, backed by `state.recent` rather than `state.lists` — never a real list id. */
export const RECENT_LIST_ID = '__recent__';

export interface WordbankState {
  lists: PhraseList[];
  recent: string[];
  selectedListId: string;
}

// ---- pure helpers ----------------------------------------------------------

function makeList(name: string): PhraseList {
  return { id: crypto.randomUUID(), name, phrases: [] };
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

/** The persisted `selectedListId` if it names one of `lists` (or the pinned Recent list); the first list otherwise. Never throws. */
function loadSelectedListId(storage: Storage | undefined, lists: readonly PhraseList[]): string {
  const fallback = lists[0]!.id;
  if (!storage) return fallback;
  try {
    const stored = storage.getItem(UI_STORAGE_KEY);
    if (stored === RECENT_LIST_ID) return stored;
    return stored !== null && lists.some((l) => l.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

// ---- store ------------------------------------------------------------------

export interface CreateStoreOptions {
  /** Wordbank hydrated before mount (e.g. via `fetchWordbank()`); defaults to a single empty `List 1` list. */
  initial?: Wordbank;
  /** Where wordbank writes (lists/phrases/recent) go. Omitted in tests that don't care about persistence. */
  persistence?: { save: (wordbank: Wordbank) => void | Promise<void> };
  /** Where `selectedListId` — UI state, not wordbank content — is remembered. Defaults to `localStorage`. */
  uiStorage?: Storage;
  /** Debounce window for writes, in ms. Default 200. */
  debounceMs?: number;
}

export interface WordbankStore {
  state: WordbankState;

  /** Feed a committed phrase (from either text input) into the recent list. */
  commitRecent: (phrase: string) => void;
  /** Remove a phrase from the recent list. */
  deleteRecent: (phrase: string) => void;

  /** Append a new `List N` list and select it; returns its id. */
  addList: () => string;
  /** Rename a list; a blank (post-trim) name is a no-op, leaving the old name. */
  renameList: (id: string, name: string) => void;
  /** Delete a list (no-op if it's the last one); reassigns the selected list if needed. */
  deleteList: (id: string) => void;
  /** Also accepts `RECENT_LIST_ID`, selecting the pinned Recent list. */
  selectList: (id: string) => void;
  reorderLists: (fromIndex: number, toIndex: number) => void;

  /** Add a phrase to the bottom of a list's phrases; moves an existing match to the bottom instead of duplicating. */
  addPhrase: (listId: string, phrase: string) => void;
  deletePhrase: (listId: string, index: number) => void;
  reorderPhrase: (listId: string, fromIndex: number, toIndex: number) => void;
  /** One-shot alphabetical sort (case-insensitive), persisted as the new manual order. */
  sortPhrases: (listId: string) => void;

  /** Cancel any pending debounced write (e.g. on app teardown). */
  dispose: () => void;
}

export function createWordbankStore(options: CreateStoreOptions = {}): WordbankStore {
  const uiStorage =
    options.uiStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const wordbank = options.initial ?? defaultWordbank();

  const [state, setState] = createStore<WordbankState>({
    lists: wordbank.lists,
    recent: wordbank.recent,
    selectedListId: loadSelectedListId(uiStorage, wordbank.lists),
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let wordbankDirty = false;
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
    if (wordbankDirty) {
      wordbankDirty = false;
      void writeWordbank();
    }
  }

  function writeUiStorage() {
    if (!uiStorage) return;
    try {
      uiStorage.setItem(UI_STORAGE_KEY, state.selectedListId);
    } catch {
      // A UI preference, not wordbank content — silently dropped on quota/private-mode failure.
    }
  }

  async function writeWordbank() {
    if (!options.persistence) return;
    try {
      await options.persistence.save({ lists: unwrap(state.lists), recent: unwrap(state.recent) });
    } catch (err) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        console.warn('[vj-gui] failed to persist wordbank; continuing in-memory', err);
      }
    }
  }

  function markWordbankDirty() {
    wordbankDirty = true;
    scheduleSave();
  }

  function markUiDirty() {
    uiDirty = true;
    scheduleSave();
  }

  function findListIndex(id: string): number {
    return state.lists.findIndex((l) => l.id === id);
  }

  function nextListName(): string {
    const used = new Set(state.lists.map((l) => l.name));
    let n = 1;
    while (used.has(`List ${n}`)) n++;
    return `List ${n}`;
  }

  function commitRecent(phrase: string): void {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    setState('recent', (recent) => moveToFront(recent, trimmed, RECENT_LIMIT));
    markWordbankDirty();
  }

  function deleteRecent(phrase: string): void {
    setState('recent', (recent) => recent.filter((p) => p !== phrase));
    markWordbankDirty();
  }

  function addList(): string {
    const list = makeList(nextListName());
    setState('lists', (lists) => [...lists, list]);
    setState('selectedListId', list.id);
    markWordbankDirty();
    markUiDirty();
    return list.id;
  }

  function renameList(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return; // empty name reverts to the previous one (i.e. no-op)
    const idx = findListIndex(id);
    if (idx === -1) return;
    setState('lists', idx, 'name', trimmed);
    markWordbankDirty();
  }

  function deleteList(id: string): void {
    if (state.lists.length <= 1) return; // last-list guard
    const idx = findListIndex(id);
    if (idx === -1) return;
    const wasSelected = state.selectedListId === id;

    setState('lists', (lists) => lists.filter((l) => l.id !== id));

    if (wasSelected) {
      // Left neighbour, or the new first list if the deleted one was first.
      const newIdx = Math.min(Math.max(0, idx - 1), state.lists.length - 1);
      const next = state.lists[newIdx];
      if (next) {
        setState('selectedListId', next.id);
        markUiDirty();
      }
    }
    markWordbankDirty();
  }

  function selectList(id: string): void {
    if (id !== RECENT_LIST_ID && findListIndex(id) === -1) return;
    setState('selectedListId', id);
    markUiDirty(); // UI-only: does not touch the wordbank, so no wordbankDirty here.
  }

  function reorderLists(fromIndex: number, toIndex: number): void {
    const { lists } = state;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= lists.length ||
      toIndex < 0 ||
      toIndex >= lists.length
    ) {
      return;
    }
    setState('lists', (lists) => moveItem(lists, fromIndex, toIndex));
    markWordbankDirty();
  }

  function addPhrase(listId: string, phrase: string): void {
    const trimmed = phrase.trim();
    if (!trimmed) return;
    const idx = findListIndex(listId);
    if (idx === -1) return;
    setState('lists', idx, 'phrases', (phrases) => moveToBack(phrases, trimmed));
    markWordbankDirty();
  }

  function deletePhrase(listId: string, index: number): void {
    const idx = findListIndex(listId);
    if (idx === -1) return;
    setState('lists', idx, 'phrases', (phrases) => phrases.filter((_, i) => i !== index));
    markWordbankDirty();
  }

  function reorderPhrase(listId: string, fromIndex: number, toIndex: number): void {
    const idx = findListIndex(listId);
    if (idx === -1) return;
    const { phrases } = state.lists[idx]!;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= phrases.length ||
      toIndex < 0 ||
      toIndex >= phrases.length
    ) {
      return;
    }
    setState('lists', idx, 'phrases', (phrases) => moveItem(phrases, fromIndex, toIndex));
    markWordbankDirty();
  }

  function sortPhrases(listId: string): void {
    const idx = findListIndex(listId);
    if (idx === -1) return;
    setState('lists', idx, 'phrases', (phrases) =>
      [...phrases].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );
    markWordbankDirty();
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
    addList,
    renameList,
    deleteList,
    selectList,
    reorderLists,
    addPhrase,
    deletePhrase,
    reorderPhrase,
    sortPhrases,
    dispose,
  };
}
