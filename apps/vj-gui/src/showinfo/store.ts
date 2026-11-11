import { createStore, produce, unwrap } from 'solid-js/store';
import {
  defaultShowDocument,
  type Alias,
  type ShowDocument,
  type ShowRow,
} from '@domain/showinfo/showinfo';
import { createDebouncedSaver } from '@/platform/debounced-saver';
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

  setOverride: (layer: string, slot: number, text: string) => void;
  clearOverrides: (layer: string) => void;

  flush: () => void;
  dispose: () => void;
}

export function createShowInfoStore(options: CreateShowInfoStoreOptions = {}): ShowInfoStore {
  const [state, setState] = createStore<ShowDocument>(options.initial ?? defaultShowDocument());

  const saver = createDebouncedSaver({
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    label: 'show info',
    save: () =>
      options.persistence?.save({
        show: unwrap(state.show),
        overrides: unwrap(state.overrides),
      }),
  });

  function rowIndex(id: string): number {
    return state.show.rows.findIndex((r) => r.id === id);
  }

  function inRange(index: number, length: number): boolean {
    return index >= 0 && index < length;
  }

  function addRow(): string {
    const row = makeRow();
    setState('show', 'rows', (rows) => [...rows, row]);
    saver.schedule();
    return row.id;
  }

  function removeRow(id: string): void {
    setState('show', 'rows', (rows) => rows.filter((r) => r.id !== id));
    saver.schedule();
  }

  function moveRow(fromIndex: number, toIndex: number): void {
    const { length } = state.show.rows;
    if (fromIndex === toIndex || !inRange(fromIndex, length) || !inRange(toIndex, length)) return;
    setState('show', 'rows', (rows) => moveItem(rows, fromIndex, toIndex));
    saver.schedule();
  }

  function setRowText(id: string, text: string): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'text', text);
    saver.schedule();
  }

  function setRowAlias(id: string, alias: Alias | null): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'alias', alias);
    saver.schedule();
  }

  function toggleRow(id: string): void {
    const i = rowIndex(id);
    if (i === -1) return;
    setState('show', 'rows', i, 'on', (on) => !on);
    saver.schedule();
  }

  function setOverride(layer: string, slot: number, text: string): void {
    if (slot < 0) return;
    setState('overrides', layer, withSlot(state.overrides[layer], slot, text));
    saver.schedule();
  }

  function clearOverrides(layer: string): void {
    setState(
      produce((doc) => {
        delete doc.overrides[layer];
      }),
    );
    saver.schedule();
  }

  return {
    state,
    addRow,
    removeRow,
    moveRow,
    setRowText,
    setRowAlias,
    toggleRow,
    setOverride,
    clearOverrides,
    flush: saver.flush,
    dispose: saver.dispose,
  };
}
