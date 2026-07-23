/**
 * Store tests (TEXT_SELECTOR.md § "Testing"). Runs against the store module
 * only — no DOM, no components — with a fake `Storage` injected so tests
 * never touch real `localStorage` and can run concurrently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTextSelectorStore, loadState, type StoredState } from './store'

class FakeStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

let stores: { dispose: () => void }[] = []

function makeStore(storage: Storage, debounceMs = 20) {
  const store = createTextSelectorStore({ storage, debounceMs })
  stores.push(store)
  return store
}

beforeEach(() => {
  stores = []
})

afterEach(() => {
  for (const s of stores) s.dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---- recent list -----------------------------------------------------

describe('recent list', () => {
  it('adds a committed phrase to the front', () => {
    const store = makeStore(new FakeStorage())
    store.commitRecent('hello world')
    expect(store.state.recent).toEqual(['hello world'])
  })

  it('dedupes to the top instead of duplicating', () => {
    const store = makeStore(new FakeStorage())
    store.commitRecent('a')
    store.commitRecent('b')
    store.commitRecent('c')
    store.commitRecent('a')
    expect(store.state.recent).toEqual(['a', 'c', 'b'])
  })

  it('caps at 10 entries, dropping from the tail', () => {
    const store = makeStore(new FakeStorage())
    for (let i = 0; i < 12; i++) store.commitRecent(`phrase ${i}`)
    expect(store.state.recent).toHaveLength(10)
    expect(store.state.recent[0]).toBe('phrase 11')
    expect(store.state.recent).not.toContain('phrase 0')
    expect(store.state.recent).not.toContain('phrase 1')
  })

  it('rejects empty (or whitespace-only) commits', () => {
    const store = makeStore(new FakeStorage())
    store.commitRecent('')
    store.commitRecent('   ')
    expect(store.state.recent).toEqual([])
  })

  it('is fed by both inputs into one shared list', () => {
    const store = makeStore(new FakeStorage())
    store.commitRecent('from text1')
    store.commitRecent('from text2')
    expect(store.state.recent).toEqual(['from text2', 'from text1'])
  })

  it('matching is case-sensitive on the trimmed string', () => {
    const store = makeStore(new FakeStorage())
    store.commitRecent('HELLO')
    store.commitRecent('hello')
    expect(store.state.recent).toEqual(['hello', 'HELLO'])
  })
})

// ---- tabs --------------------------------------------------------------

describe('tabs', () => {
  it('starts with a single default tab named "List 1"', () => {
    const store = makeStore(new FakeStorage())
    expect(store.state.tabs).toHaveLength(1)
    expect(store.state.tabs[0]?.name).toBe('List 1')
    expect(store.state.activeTabId).toBe(store.state.tabs[0]?.id)
  })

  it('add appends a new "List N" tab (lowest unused N) and activates it', () => {
    const store = makeStore(new FakeStorage())
    const id2 = store.addTab()
    expect(store.state.tabs.map((t) => t.name)).toEqual(['List 1', 'List 2'])
    expect(store.state.activeTabId).toBe(id2)

    store.deleteTab(id2)
    const id2Again = store.addTab()
    expect(store.state.tabs.map((t) => t.name)).toEqual(['List 1', 'List 2'])
    expect(id2Again).not.toBe(id2)
  })

  it('renames a tab', () => {
    const store = makeStore(new FakeStorage())
    const id = store.state.tabs[0]!.id
    store.renameTab(id, 'Cues')
    expect(store.state.tabs[0]?.name).toBe('Cues')
  })

  it('an empty (post-trim) rename reverts to the previous name', () => {
    const store = makeStore(new FakeStorage())
    const id = store.state.tabs[0]!.id
    store.renameTab(id, '   ')
    expect(store.state.tabs[0]?.name).toBe('List 1')
  })

  it('deletes a tab', () => {
    const store = makeStore(new FakeStorage())
    const id2 = store.addTab()
    const id1 = store.state.tabs[0]!.id
    store.setActiveTab(id1)
    store.deleteTab(id2)
    expect(store.state.tabs.map((t) => t.id)).toEqual([id1])
  })

  it('the last tab cannot be deleted', () => {
    const store = makeStore(new FakeStorage())
    const id = store.state.tabs[0]!.id
    store.deleteTab(id)
    expect(store.state.tabs).toHaveLength(1)
    expect(store.state.tabs[0]?.id).toBe(id)
  })

  it('deleting the active tab activates its left neighbour', () => {
    const store = makeStore(new FakeStorage())
    const idA = store.state.tabs[0]!.id
    const idB = store.addTab()
    const idC = store.addTab()
    store.setActiveTab(idB)
    store.deleteTab(idB)
    expect(store.state.tabs.map((t) => t.id)).toEqual([idA, idC])
    expect(store.state.activeTabId).toBe(idA)
  })

  it('deleting the first (active) tab activates the new first tab', () => {
    const store = makeStore(new FakeStorage())
    const idA = store.state.tabs[0]!.id
    const idB = store.addTab()
    store.setActiveTab(idA)
    store.deleteTab(idA)
    expect(store.state.tabs.map((t) => t.id)).toEqual([idB])
    expect(store.state.activeTabId).toBe(idB)
  })

  it('deleting an inactive tab leaves the active tab untouched', () => {
    const store = makeStore(new FakeStorage())
    const idA = store.state.tabs[0]!.id
    const idB = store.addTab()
    store.setActiveTab(idA)
    store.deleteTab(idB)
    expect(store.state.activeTabId).toBe(idA)
  })

  it('reorders tabs', () => {
    const store = makeStore(new FakeStorage())
    const idA = store.state.tabs[0]!.id
    const idB = store.addTab()
    const idC = store.addTab()
    store.reorderTabs(0, 2)
    expect(store.state.tabs.map((t) => t.id)).toEqual([idB, idC, idA])
  })
})

// ---- phrases -------------------------------------------------------------

describe('phrases', () => {
  it('adds a phrase to the top of the list', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'hello world')
    store.addPhrase(tabId, 'cue two')
    expect(store.state.tabs[0]?.phrases).toEqual(['cue two', 'hello world'])
  })

  it('trims added phrases and ignores empty input', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, '  padded  ')
    store.addPhrase(tabId, '   ')
    expect(store.state.tabs[0]?.phrases).toEqual(['padded'])
  })

  it('adding an existing phrase moves it to the top instead of duplicating', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'a')
    store.addPhrase(tabId, 'b')
    store.addPhrase(tabId, 'a')
    expect(store.state.tabs[0]?.phrases).toEqual(['a', 'b'])
  })

  it('the same phrase may appear in different tabs', () => {
    const store = makeStore(new FakeStorage())
    const tabA = store.state.tabs[0]!.id
    const tabB = store.addTab()
    store.addPhrase(tabA, 'shared')
    store.addPhrase(tabB, 'shared')
    expect(store.state.tabs.find((t) => t.id === tabA)?.phrases).toEqual(['shared'])
    expect(store.state.tabs.find((t) => t.id === tabB)?.phrases).toEqual(['shared'])
  })

  it('deletes a phrase by index', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'a')
    store.addPhrase(tabId, 'b')
    store.addPhrase(tabId, 'c') // -> [c, b, a]
    store.deletePhrase(tabId, 1) // remove 'b'
    expect(store.state.tabs[0]?.phrases).toEqual(['c', 'a'])
  })

  it('reorders phrases within a tab', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'a')
    store.addPhrase(tabId, 'b')
    store.addPhrase(tabId, 'c') // -> [c, b, a]
    store.reorderPhrase(tabId, 0, 2) // move 'c' to the end
    expect(store.state.tabs[0]?.phrases).toEqual(['b', 'a', 'c'])
  })

  it('sorts alphabetically (case-insensitive) once, and it persists as manual order', () => {
    const store = makeStore(new FakeStorage())
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'banana')
    store.addPhrase(tabId, 'Apple')
    store.addPhrase(tabId, 'cherry')
    store.sortPhrases(tabId)
    expect(store.state.tabs[0]?.phrases).toEqual(['Apple', 'banana', 'cherry'])

    // Not a sticky mode: a subsequent add still lands on top, not re-sorted.
    store.addPhrase(tabId, 'zeta')
    expect(store.state.tabs[0]?.phrases).toEqual(['zeta', 'Apple', 'banana', 'cherry'])
  })
})

// ---- persistence -----------------------------------------------------

describe('persistence', () => {
  it('round-trips through storage', async () => {
    vi.useFakeTimers()
    const storage = new FakeStorage()
    const store = makeStore(storage, 20)
    const tabId = store.state.tabs[0]!.id
    store.addPhrase(tabId, 'hello world')
    store.commitRecent('hello world')

    await vi.advanceTimersByTimeAsync(50)

    const reloaded = loadState(storage)
    expect(reloaded.tabs[0]?.phrases).toEqual(['hello world'])
    expect(reloaded.recent).toEqual(['hello world'])
    expect(reloaded.activeTabId).toBe(store.state.activeTabId)
  })

  it('coalesces rapid mutations into a single debounced write', async () => {
    vi.useFakeTimers()
    const storage = new FakeStorage()
    const setItemSpy = vi.spyOn(storage, 'setItem')
    const store = makeStore(storage, 50)

    store.commitRecent('one')
    store.commitRecent('two')
    store.commitRecent('three')

    expect(setItemSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60)
    expect(setItemSpy).toHaveBeenCalledTimes(1)

    const written = JSON.parse(setItemSpy.mock.calls[0]![1] as string) as StoredState
    expect(written.recent).toEqual(['three', 'two', 'one'])
  })

  it('falls back to defaults on corrupt JSON', () => {
    const storage = new FakeStorage()
    storage.setItem('td-web-gui:text-selector', '{not valid json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = loadState(storage)
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]?.name).toBe('List 1')
    expect(state.recent).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to defaults on an unrecognised version', () => {
    const storage = new FakeStorage()
    storage.setItem(
      'td-web-gui:text-selector',
      JSON.stringify({ version: 2, recent: [], tabs: [{ id: 'x', name: 'Old', phrases: [] }], activeTabId: 'x' }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = loadState(storage)
    expect(state.tabs[0]?.name).toBe('List 1')
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to defaults when storage is empty', () => {
    const state = loadState(new FakeStorage())
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]?.name).toBe('List 1')
  })

  it('a write failure is logged once and non-fatal — the app keeps working in-memory', async () => {
    vi.useFakeTimers()
    const storage = new FakeStorage()
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = makeStore(storage, 20)

    store.commitRecent('one')
    await vi.advanceTimersByTimeAsync(30)
    store.commitRecent('two')
    await vi.advanceTimersByTimeAsync(30)

    expect(warn).toHaveBeenCalledTimes(1)
    // In-memory state is unaffected by the persistence failure.
    expect(store.state.recent).toEqual(['two', 'one'])
  })
})
