import { createStore, unwrap } from 'solid-js/store';
import type { Alias, ShowInfo, ShowRow } from '@domain/textstate/textstate';
import { moveItem } from '@/ui/dnd';

export interface ShowEditor {
  state: ShowInfo;
  addRow: () => string;
  removeRow: (id: string) => void;
  moveRow: (fromIndex: number, toIndex: number) => void;
  setRowText: (id: string, text: string) => void;
  setRowAlias: (id: string, alias: Alias | null) => void;
  toggleRow: (id: string) => void;
}

function makeRow(): ShowRow {
  return { id: crypto.randomUUID(), alias: null, text: '', on: true };
}

function inRange(index: number, length: number): boolean {
  return index >= 0 && index < length;
}

export function createShowEditor(initial: ShowInfo): ShowEditor {
  const [state, setState] = createStore<ShowInfo>(structuredClone(unwrap(initial)));

  function rowIndex(id: string): number {
    return state.rows.findIndex((r) => r.id === id);
  }

  return {
    state,
    addRow() {
      const row = makeRow();
      setState('rows', (rows) => [...rows, row]);
      return row.id;
    },
    removeRow(id) {
      setState('rows', (rows) => rows.filter((r) => r.id !== id));
    },
    moveRow(fromIndex, toIndex) {
      const { length } = state.rows;
      if (fromIndex === toIndex || !inRange(fromIndex, length) || !inRange(toIndex, length)) return;
      setState('rows', (rows) => moveItem(rows, fromIndex, toIndex));
    },
    setRowText(id, text) {
      const i = rowIndex(id);
      if (i !== -1) setState('rows', i, 'text', text);
    },
    setRowAlias(id, alias) {
      const i = rowIndex(id);
      if (i !== -1) setState('rows', i, 'alias', alias);
    },
    toggleRow(id) {
      const i = rowIndex(id);
      if (i !== -1) setState('rows', i, 'on', (on) => !on);
    },
  };
}
