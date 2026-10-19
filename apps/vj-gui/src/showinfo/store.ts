import { createStore, produce, unwrap } from 'solid-js/store';
import {
  actTextList,
  defaultShowDocument,
  trimOverrides,
  type Alias,
  type Artist,
  type ShowDocument,
  type ShowRow,
} from '@domain/showinfo/showinfo';
import { moveItem } from '@/ui/dnd';

const DEFAULT_DEBOUNCE_MS = 200;

export function withSlot(
  texts: readonly string[] | undefined,
  slot: number,
  text: string,
): string[] {
  const next = [...(texts ?? [])];
  while (next.length <= slot) next.push('');
  next[slot] = text;
  return next;
}

function makeRow(): ShowRow {
  return { id: crypto.randomUUID(), alias: null, text: '', on: true };
}

function makeArtist(): Artist {
  return { id: crypto.randomUUID(), name: '', active: true };
}

export interface CreateShowInfoStoreOptions {
  initial?: ShowDocument;
  persistence?: { save: (doc: ShowDocument) => void | Promise<void> };
  debounceMs?: number;
}

export interface ShowInfoStore {
  state: ShowDocument;

  addRow: () => string;
  removeRow: (id: string) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
  setRowText: (id: string, text: string) => void;
  setRowAlias: (id: string, alias: Alias | null) => void;
  toggleRow: (id: string) => void;

  addArtist: () => string;
  removeArtist: (id: string) => void;
  moveArtist: (fromIndex: number, toIndex: number) => void;
  setArtistName: (id: string, name: string) => void;
  toggleArtist: (id: string) => void;

  setOverride: (layer: string, slot: number, text: string) => void;
  clearOverrides: (layer: string) => void;

  flush: () => void;
  dispose: () => void;
}

export function createShowInfoStore(options: CreateShowInfoStoreOptions = {}): ShowInfoStore {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const [state, setState] = createStore<ShowDocument>(options.initial ?? defaultShowDocument());

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let warnedWriteFailure = false;

  function scheduleSave() {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void write();
    }, debounceMs);
  }

  function showEdited() {
    const trimmed = trimOverrides(unwrap(state.overrides), actTextList(state.show).length);
    setState(
      produce((doc) => {
        doc.overrides = trimmed;
      }),
    );
    scheduleSave();
  }

  function flush() {
    if (saveTimer === undefined) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    void write();
  }

  async function write() {
    if (!options.persistence) return;
    try {
      await options.persistence.save({
        show: unwrap(state.show),
        overrides: unwrap(state.overrides),
      });
    } catch (err) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        console.warn('[vj-gui] failed to persist show info; continuing in-memory', err);
      }
    }
  }

  function rowIndex(id: string): number {
    return state.show.rows.findIndex((r) => r.id === id);
  }

  function artistIndex(id: string): number {
    return state.show.artists.findIndex((a) => a.id === id);
  }

  function inRange(index: number, length: number): boolean {
    return index >= 0 && index < length;
  }

  function addRow(): string {
    const row = makeRow();
    setState('show', 'rows', (rows) => [...rows, row]);
    showEdited();
    return row.id;
  }

  function removeRow(id: string): void {
    setState('show', 'rows', (rows) => rows.filter((r) => r.id !== id));
    showEdited();
  }

  function moveRow(fromIndex: number, toIndex: number): void {
    const { length } = state.show.rows;
    if (fromIndex === toIndex || !inRange(fromIndex, length) || !inRange(toIndex, length)) return;
    setState('show', 'rows', (rows) => moveItem(rows, fromIndex, toIndex));
    showEdited();
  }

  function setRowText(id: string, text: string): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'text', text);
    showEdited();
  }

  function setRowAlias(id: string, alias: Alias | null): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'alias', alias);
    showEdited();
  }

  function toggleRow(id: string): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'on', (on) => !on);
    showEdited();
  }

  function addArtist(): string {
    const artist = makeArtist();
    setState('show', 'artists', (artists) => [...artists, artist]);
    showEdited();
    return artist.id;
  }

  function removeArtist(id: string): void {
    setState('show', 'artists', (artists) => artists.filter((a) => a.id !== id));
    showEdited();
  }

  function moveArtist(fromIndex: number, toIndex: number): void {
    const { length } = state.show.artists;
    if (fromIndex === toIndex || !inRange(fromIndex, length) || !inRange(toIndex, length)) return;
    setState('show', 'artists', (artists) => moveItem(artists, fromIndex, toIndex));
    showEdited();
  }

  function setArtistName(id: string, name: string): void {
    const i = artistIndex(id);
    if (i === -1) return;
    setState('show', 'artists', i, 'name', name);
    showEdited();
  }

  function toggleArtist(id: string): void {
    const i = artistIndex(id);
    if (i === -1) return;
    setState('show', 'artists', i, 'active', (active) => !active);
    showEdited();
  }

  function setOverride(layer: string, slot: number, text: string): void {
    if (slot < 0) return;
    setState('overrides', layer, withSlot(state.overrides[layer], slot, text));
    scheduleSave();
  }

  function clearOverrides(layer: string): void {
    setState(
      produce((doc) => {
        delete doc.overrides[layer];
      }),
    );
    scheduleSave();
  }

  function dispose(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
  }

  return {
    state,
    addRow,
    removeRow,
    moveRow,
    setRowText,
    setRowAlias,
    toggleRow,
    addArtist,
    removeArtist,
    moveArtist,
    setArtistName,
    toggleArtist,
    setOverride,
    clearOverrides,
    flush,
    dispose,
  };
}
