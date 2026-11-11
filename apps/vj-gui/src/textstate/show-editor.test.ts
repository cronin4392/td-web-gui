import { describe, expect, it } from 'vitest';
import type { ShowInfo } from '@domain/textstate/textstate';
import { createShowEditor } from './show-editor';

function show(): ShowInfo {
  return {
    rows: [
      { id: 'r1', alias: 'artist', text: 'Amy', on: true },
      { id: 'r2', alias: null, text: 'Hello', on: true },
      { id: 'r3', alias: 'venue', text: '', on: false },
    ],
  };
}

describe('createShowEditor', () => {
  it('adds an unaliased, empty, on row at the end', () => {
    const editor = createShowEditor(show());
    const id = editor.addRow();
    expect(editor.state.rows.at(-1)).toEqual({ id, alias: null, text: '', on: true });
  });

  it('removes, edits and toggles by id', () => {
    const editor = createShowEditor(show());
    editor.setRowText('r2', 'Bye');
    editor.setRowAlias('r2', 'city');
    editor.toggleRow('r2');
    editor.removeRow('r1');
    expect(editor.state.rows.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(editor.state.rows[0]).toEqual({ id: 'r2', alias: 'city', text: 'Bye', on: false });
  });

  it('moves a row and ignores out-of-range moves', () => {
    const editor = createShowEditor(show());
    editor.moveRow(0, 2);
    expect(editor.state.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
    editor.moveRow(0, 9);
    editor.moveRow(-1, 0);
    expect(editor.state.rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('ignores an unknown id', () => {
    const editor = createShowEditor(show());
    editor.setRowText('nope', 'x');
    editor.toggleRow('nope');
    expect(editor.state.rows).toEqual(show().rows);
  });

  it('leaves the show it started from untouched', () => {
    const initial = show();
    const editor = createShowEditor(initial);
    editor.setRowText('r1', 'Bea');
    editor.removeRow('r2');
    expect(initial).toEqual(show());
  });
});
