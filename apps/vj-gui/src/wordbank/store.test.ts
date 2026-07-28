/**
 * Store tests (TEXT_SELECTOR.md § "Testing"). Runs against the store module
 * only — no DOM, no components. Recent/lists/phrases assertions are
 * persistence-agnostic; the persistence block below exercises the
 * wordbank-write / `selectedListId`-to-`localStorage` split directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { createWordbankStore, type CreateStoreOptions } from './store';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let stores: { dispose: () => void }[] = [];

function makeStore(options: CreateStoreOptions = {}) {
  const store = createWordbankStore({ debounceMs: 20, ...options });
  stores.push(store);
  return store;
}

beforeEach(() => {
  stores = [];
});

afterEach(() => {
  for (const s of stores) s.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---- recent list -----------------------------------------------------

describe('recent list', () => {
  it('adds a committed phrase to the front', () => {
    const store = makeStore();
    store.commitRecent('hello world');
    expect(store.state.recent).toEqual(['hello world']);
  });

  it('dedupes to the top instead of duplicating', () => {
    const store = makeStore();
    store.commitRecent('a');
    store.commitRecent('b');
    store.commitRecent('c');
    store.commitRecent('a');
    expect(store.state.recent).toEqual(['a', 'c', 'b']);
  });

  it('caps at 10 entries, dropping from the tail', () => {
    const store = makeStore();
    for (let i = 0; i < 12; i++) store.commitRecent(`phrase ${i}`);
    expect(store.state.recent).toHaveLength(10);
    expect(store.state.recent[0]).toBe('phrase 11');
    expect(store.state.recent).not.toContain('phrase 0');
    expect(store.state.recent).not.toContain('phrase 1');
  });

  it('rejects empty (or whitespace-only) commits', () => {
    const store = makeStore();
    store.commitRecent('');
    store.commitRecent('   ');
    expect(store.state.recent).toEqual([]);
  });

  it('is fed by both inputs into one shared list', () => {
    const store = makeStore();
    store.commitRecent('from text1');
    store.commitRecent('from text2');
    expect(store.state.recent).toEqual(['from text2', 'from text1']);
  });

  it('matching is case-sensitive on the trimmed string', () => {
    const store = makeStore();
    store.commitRecent('HELLO');
    store.commitRecent('hello');
    expect(store.state.recent).toEqual(['hello', 'HELLO']);
  });

  it('deleteRecent removes a single entry, leaving the rest in order', () => {
    const store = makeStore();
    store.commitRecent('a');
    store.commitRecent('b');
    store.commitRecent('c');
    store.deleteRecent('b');
    expect(store.state.recent).toEqual(['c', 'a']);
  });

  it('deleteRecent is a no-op for a phrase not in the list', () => {
    const store = makeStore();
    store.commitRecent('a');
    store.deleteRecent('missing');
    expect(store.state.recent).toEqual(['a']);
  });
});

// ---- lists --------------------------------------------------------------

describe('lists', () => {
  it('starts with a single default list named "List 1"', () => {
    const store = makeStore();
    expect(store.state.lists).toHaveLength(1);
    expect(store.state.lists[0]?.name).toBe('List 1');
    expect(store.state.selectedListId).toBe(store.state.lists[0]?.id);
  });

  it('add appends a new "List N" list (lowest unused N) and selects it', () => {
    const store = makeStore();
    const id2 = store.addList();
    expect(store.state.lists.map((l) => l.name)).toEqual(['List 1', 'List 2']);
    expect(store.state.selectedListId).toBe(id2);

    store.deleteList(id2);
    const id2Again = store.addList();
    expect(store.state.lists.map((l) => l.name)).toEqual(['List 1', 'List 2']);
    expect(id2Again).not.toBe(id2);
  });

  it('renames a list', () => {
    const store = makeStore();
    const id = store.state.lists[0]!.id;
    store.renameList(id, 'Cues');
    expect(store.state.lists[0]?.name).toBe('Cues');
  });

  it('an empty (post-trim) rename reverts to the previous name', () => {
    const store = makeStore();
    const id = store.state.lists[0]!.id;
    store.renameList(id, '   ');
    expect(store.state.lists[0]?.name).toBe('List 1');
  });

  it('deletes a list', () => {
    const store = makeStore();
    const id2 = store.addList();
    const id1 = store.state.lists[0]!.id;
    store.selectList(id1);
    store.deleteList(id2);
    expect(store.state.lists.map((l) => l.id)).toEqual([id1]);
  });

  it('the last list cannot be deleted', () => {
    const store = makeStore();
    const id = store.state.lists[0]!.id;
    store.deleteList(id);
    expect(store.state.lists).toHaveLength(1);
    expect(store.state.lists[0]?.id).toBe(id);
  });

  it('deleting the selected list activates its left neighbour', () => {
    const store = makeStore();
    const idA = store.state.lists[0]!.id;
    const idB = store.addList();
    const idC = store.addList();
    store.selectList(idB);
    store.deleteList(idB);
    expect(store.state.lists.map((l) => l.id)).toEqual([idA, idC]);
    expect(store.state.selectedListId).toBe(idA);
  });

  it('deleting the first (selected) list activates the new first list', () => {
    const store = makeStore();
    const idA = store.state.lists[0]!.id;
    const idB = store.addList();
    store.selectList(idA);
    store.deleteList(idA);
    expect(store.state.lists.map((l) => l.id)).toEqual([idB]);
    expect(store.state.selectedListId).toBe(idB);
  });

  it('deleting an unselected list leaves the selected list untouched', () => {
    const store = makeStore();
    const idA = store.state.lists[0]!.id;
    const idB = store.addList();
    store.selectList(idA);
    store.deleteList(idB);
    expect(store.state.selectedListId).toBe(idA);
  });

  it('reorders lists', () => {
    const store = makeStore();
    const idA = store.state.lists[0]!.id;
    const idB = store.addList();
    const idC = store.addList();
    store.reorderLists(0, 2);
    expect(store.state.lists.map((l) => l.id)).toEqual([idB, idC, idA]);
  });
});

// ---- phrases -------------------------------------------------------------

describe('phrases', () => {
  it('adds a phrase to the bottom of the list', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'hello world');
    store.addPhrase(listId, 'cue two');
    expect(store.state.lists[0]?.phrases).toEqual(['hello world', 'cue two']);
  });

  it('trims added phrases and ignores empty input', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, '  padded  ');
    store.addPhrase(listId, '   ');
    expect(store.state.lists[0]?.phrases).toEqual(['padded']);
  });

  it('adding an existing phrase moves it to the bottom instead of duplicating', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'a');
    store.addPhrase(listId, 'b');
    store.addPhrase(listId, 'a');
    expect(store.state.lists[0]?.phrases).toEqual(['b', 'a']);
  });

  it('the same phrase may appear in different lists', () => {
    const store = makeStore();
    const listA = store.state.lists[0]!.id;
    const listB = store.addList();
    store.addPhrase(listA, 'shared');
    store.addPhrase(listB, 'shared');
    expect(store.state.lists.find((l) => l.id === listA)?.phrases).toEqual(['shared']);
    expect(store.state.lists.find((l) => l.id === listB)?.phrases).toEqual(['shared']);
  });

  it('deletes a phrase by index', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'a');
    store.addPhrase(listId, 'b');
    store.addPhrase(listId, 'c'); // -> [a, b, c]
    store.deletePhrase(listId, 1); // remove 'b'
    expect(store.state.lists[0]?.phrases).toEqual(['a', 'c']);
  });

  it('reorders phrases within a list', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'a');
    store.addPhrase(listId, 'b');
    store.addPhrase(listId, 'c'); // -> [a, b, c]
    store.reorderPhrase(listId, 0, 2); // move 'a' to the end
    expect(store.state.lists[0]?.phrases).toEqual(['b', 'c', 'a']);
  });

  it('sorts alphabetically (case-insensitive) once, and it persists as manual order', () => {
    const store = makeStore();
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'banana');
    store.addPhrase(listId, 'Apple');
    store.addPhrase(listId, 'cherry');
    store.sortPhrases(listId);
    expect(store.state.lists[0]?.phrases).toEqual(['Apple', 'banana', 'cherry']);

    // Not a sticky mode: a subsequent add still lands at the bottom, not re-sorted.
    store.addPhrase(listId, 'zeta');
    expect(store.state.lists[0]?.phrases).toEqual(['Apple', 'banana', 'cherry', 'zeta']);
  });
});

// ---- persistence -----------------------------------------------------

describe('persistence', () => {
  function fakePersistence() {
    const calls: Wordbank[] = [];
    return {
      calls,
      save: (wordbank: Wordbank) => {
        calls.push(wordbank);
      },
    };
  }

  it('round-trips wordbank content through persistence.save', async () => {
    vi.useFakeTimers();
    const persistence = fakePersistence();
    const store = makeStore({ persistence });
    const listId = store.state.lists[0]!.id;
    store.addPhrase(listId, 'hello world');
    store.commitRecent('hello world');

    await vi.advanceTimersByTimeAsync(50);

    expect(persistence.calls).toHaveLength(1);
    expect(persistence.calls[0]?.lists[0]?.phrases).toEqual(['hello world']);
    expect(persistence.calls[0]?.recent).toEqual(['hello world']);
  });

  it('coalesces rapid mutations into a single debounced write', async () => {
    vi.useFakeTimers();
    const persistence = fakePersistence();
    const store = makeStore({ persistence, debounceMs: 50 });

    store.commitRecent('one');
    store.commitRecent('two');
    store.commitRecent('three');

    expect(persistence.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(persistence.calls).toHaveLength(1);
    expect(persistence.calls[0]?.recent).toEqual(['three', 'two', 'one']);
  });

  it('a save failure is warned once and non-fatal — the app keeps working in-memory', async () => {
    vi.useFakeTimers();
    const persistence = { save: vi.fn().mockRejectedValue(new Error('network down')) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore({ persistence });

    store.commitRecent('one');
    await vi.advanceTimersByTimeAsync(30);
    store.commitRecent('two');
    await vi.advanceTimersByTimeAsync(30);

    expect(warn).toHaveBeenCalledTimes(1);
    // In-memory state is unaffected by the persistence failure.
    expect(store.state.recent).toEqual(['two', 'one']);
  });

  it('a selected-list change alone does not trigger a wordbank write', async () => {
    vi.useFakeTimers();
    const persistence = fakePersistence();
    const store = makeStore({ persistence, uiStorage: new FakeStorage() });
    const idB = store.addList();
    await vi.advanceTimersByTimeAsync(30);
    persistence.calls.length = 0; // addList legitimately writes the wordbank; clear before the assertion below

    store.selectList(idB);
    await vi.advanceTimersByTimeAsync(30);

    expect(persistence.calls).toHaveLength(0);
  });

  it('selectedListId round-trips through uiStorage, independent of the wordbank', async () => {
    vi.useFakeTimers();
    const uiStorage = new FakeStorage();
    const first = makeStore({ uiStorage });
    const idB = first.addList();
    await vi.advanceTimersByTimeAsync(30);

    const wordbank = { lists: first.state.lists, recent: first.state.recent };
    const second = makeStore({ uiStorage, initial: wordbank });
    expect(second.state.selectedListId).toBe(idB);
  });

  it('a selectedListId with no matching list falls back to the first list', () => {
    const uiStorage = new FakeStorage();
    uiStorage.setItem('td-web-gui:vj-gui:wordbank', 'nonexistent-id');
    const store = makeStore({ uiStorage });
    expect(store.state.selectedListId).toBe(store.state.lists[0]?.id);
  });
});
