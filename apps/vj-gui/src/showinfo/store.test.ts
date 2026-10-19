import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShowDocument } from '@domain/showinfo/showinfo';
import { createShowInfoStore, withSlot, type CreateShowInfoStoreOptions } from './store';

function doc(): ShowDocument {
  return {
    show: {
      rows: [
        { id: 'r1', alias: 'artist', text: '', on: true },
        { id: 'r2', alias: null, text: 'Hello', on: true },
        { id: 'r3', alias: 'venue', text: '', on: false },
      ],
      artists: [
        { id: 'a1', name: 'Amy', active: true },
        { id: 'a2', name: 'Bo', active: false },
      ],
    },
    overrides: { A: ['x', 'y'] },
  };
}

let stores: { dispose: () => void }[] = [];

function makeStore(options: CreateShowInfoStoreOptions = {}) {
  const store = createShowInfoStore({ initial: doc(), debounceMs: 20, ...options });
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

describe('rows', () => {
  it('adds an unaliased, empty, on row at the end', () => {
    const store = makeStore();
    const id = store.addRow();
    expect(store.state.show.rows.at(-1)).toEqual({ id, alias: null, text: '', on: true });
  });

  it('removes, edits and toggles by id', () => {
    const store = makeStore();
    store.setRowText('r2', 'Bye');
    store.setRowAlias('r2', 'city');
    store.toggleRow('r2');
    store.removeRow('r1');
    expect(store.state.show.rows.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(store.state.show.rows[0]).toEqual({ id: 'r2', alias: 'city', text: 'Bye', on: false });
  });

  it('moves a row and ignores out-of-range moves', () => {
    const store = makeStore();
    store.moveRow(0, 2);
    expect(store.state.show.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
    store.moveRow(0, 9);
    store.moveRow(-1, 0);
    expect(store.state.show.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('ignores an unknown id', () => {
    const store = makeStore();
    store.setRowText('nope', 'x');
    store.toggleRow('nope');
    expect(store.state.show.rows).toEqual(doc().show.rows);
  });
});

describe('artists', () => {
  it('adds an active artist with a blank name', () => {
    const store = makeStore();
    const id = store.addArtist();
    expect(store.state.show.artists.at(-1)).toEqual({ id, name: '', active: true });
  });

  it('edits, toggles, moves and removes by id', () => {
    const store = makeStore();
    store.setArtistName('a2', 'Bob');
    store.toggleArtist('a2');
    store.moveArtist(1, 0);
    expect(store.state.show.artists.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(store.state.show.artists[0]).toEqual({ id: 'a2', name: 'Bob', active: true });
    store.removeArtist('a1');
    expect(store.state.show.artists.map((a) => a.id)).toEqual(['a2']);
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
  it('debounces edits into one save of the whole document', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.setRowText('r2', 'a');
    store.setRowText('r2', 'ab');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0]![0] as ShowDocument;
    expect(saved.show.rows[1]!.text).toBe('ab');
    expect(saved.overrides).toEqual({ A: ['x', 'y'] });
  });

  it('warns once when a save fails and keeps going', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore({
      persistence: { save: () => Promise.reject(new Error('down')) },
    });
    store.toggleRow('r1');
    await vi.advanceTimersByTimeAsync(25);
    store.toggleRow('r1');
    await vi.advanceTimersByTimeAsync(25);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels a pending save', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const store = makeStore({ persistence: { save } });
    store.toggleRow('r1');
    store.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(save).not.toHaveBeenCalled();
  });
});
