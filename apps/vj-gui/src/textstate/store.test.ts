import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextState } from '@domain/textstate/textstate';
import { createTextStateStore, withSlot, type CreateTextStateStoreOptions } from './store';

function doc(): TextState {
  return {
    show: {
      rows: [
        { id: 'r1', alias: 'artist', text: 'Amy', on: true },
        { id: 'r2', alias: null, text: 'Hello', on: true },
        { id: 'r3', alias: 'venue', text: '', on: false },
      ],
    },
    overrides: { A: ['x', 'y'] },
  };
}

let stores: { dispose: () => void }[] = [];

function makeStore(options: CreateTextStateStoreOptions = {}) {
  const store = createTextStateStore({ initial: doc(), debounceMs: 20, ...options });
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const s of stores) s.dispose();
  stores = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('withSlot', () => {
  it('pads skipped slots with blanks', () => {
    expect(withSlot(undefined, 2, 'c')).toEqual(['', '', 'c']);
  });

  it('replaces one slot and leaves the input untouched', () => {
    const input = ['a', 'b'];
    expect(withSlot(input, 1, 'z')).toEqual(['a', 'z']);
    expect(input).toEqual(['a', 'b']);
  });

  it('keeps blank as an empty string', () => {
    expect(withSlot(['a'], 0, '')).toEqual(['']);
  });
});

describe('setShow', () => {
  it('replaces the show rows and keeps every override', () => {
    const store = makeStore();
    store.setShow({ rows: [{ id: 'n1', alias: null, text: 'Only', on: true }] });
    expect(store.state.show.rows.map((r) => r.text)).toEqual(['Only']);
    expect(store.state.overrides).toEqual({ A: ['x', 'y'] });
  });

  it('does not share rows with the show it was given', () => {
    const store = makeStore();
    const show = { rows: [{ id: 'n1', alias: null, text: 'Only', on: true }] };
    store.setShow(show);
    show.rows[0]!.text = 'changed';
    expect(store.state.show.rows[0]!.text).toBe('Only');
  });

  it('saves nothing when the show is unchanged', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.setShow(doc().show);
    await vi.advanceTimersByTimeAsync(25);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('overrides', () => {
  it('sets a slot on a layer that has none yet, padding the earlier slots', () => {
    const store = makeStore();
    store.setOverride('B', 1, 'hi');
    expect(store.state.overrides.B).toEqual(['', 'hi']);
  });

  it('writes a blank as an empty string', () => {
    const store = makeStore();
    store.setOverride('A', 0, '');
    expect(store.state.overrides.A).toEqual(['', 'y']);
  });

  it('clears every slot of one layer and no other', () => {
    const store = makeStore();
    store.setOverride('B', 0, 'b');
    store.clearOverrides('A');
    expect(store.state.overrides).toEqual({ B: ['b'] });
  });
});

describe('persistence', () => {
  it('debounces edits into one save of the whole text state', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.setOverride('B', 0, 'a');
    store.setOverride('B', 0, 'ab');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0]![0] as TextState;
    expect(saved.show).toEqual(doc().show);
    expect(saved.overrides).toEqual({ A: ['x', 'y'], B: ['ab'] });
  });

  it('warns once when a save fails and keeps going', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore({
      persistence: { save: () => Promise.reject(new Error('down')) },
    });
    store.setOverride('B', 0, 'a');
    await vi.advanceTimersByTimeAsync(25);
    store.setOverride('B', 0, 'b');
    await vi.advanceTimersByTimeAsync(25);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('flush saves a pending edit at once, and only once', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.setOverride('B', 0, 'a');
    store.flush();
    expect(save).toHaveBeenCalledTimes(1);
    store.flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels a pending save', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.setOverride('B', 0, 'a');
    store.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(save).not.toHaveBeenCalled();
  });
});
