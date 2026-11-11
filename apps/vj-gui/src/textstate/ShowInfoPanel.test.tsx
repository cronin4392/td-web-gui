import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShowInfo } from '@domain/showinfo/showinfo';
import { createShowEditor, type ShowEditor } from './show-editor';
import { ShowInfoPanel } from './ShowInfoPanel';

function show(): ShowInfo {
  return {
    rows: [
      { id: 'a1', alias: 'artist', text: 'Amy', on: true },
      { id: 'a2', alias: 'artist', text: 'Bo', on: false },
      { id: 'r1', alias: 'event', text: 'Elements', on: true },
    ],
  };
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let editor: ShowEditor | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = editor = host = undefined;
});

function mount() {
  const e = (editor = createShowEditor(show()));
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(() => <ShowInfoPanel editor={e} />, host);
}

class FakeDataTransfer {
  private data = new Map<string, string>();
  effectAllowed = 'none';
  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(format: string, value: string): void {
    this.data.set(format, value);
  }
  getData(format: string): string {
    return this.data.get(format) ?? '';
  }
  setDragImage(): void {}
}

function drag(type: string, target: Element, dataTransfer: FakeDataTransfer, clientY = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer, clientX: 0, clientY });
  target.dispatchEvent(event);
}

function rowItems() {
  return [...host!.querySelectorAll('li')].filter((li) => li.querySelector('select'));
}

function rowTexts() {
  return [...host!.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Row text"]')];
}

describe('ShowInfoPanel', () => {
  it('gives every row, artist rows included, its own text box', () => {
    mount();
    expect(rowTexts().map((t) => t.value)).toEqual(['Amy', 'Bo', 'Elements']);
  });

  it('edits an artist row like any other row', () => {
    mount();
    const box = rowTexts()[1]!;
    box.value = 'Bea';
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(editor!.state.rows[1]!.text).toBe('Bea');
  });

  it('reorders a row dragged by its handle', () => {
    mount();
    const dataTransfer = new FakeDataTransfer();
    drag('dragstart', rowItems()[0]!.querySelector('[draggable="true"]')!, dataTransfer);
    drag('dragover', rowItems()[2]!, dataTransfer, 1);
    drag('drop', rowItems()[2]!, dataTransfer, 1);
    expect(editor!.state.rows.map((r) => r.id)).toEqual(['a2', 'r1', 'a1']);
  });

  it('drags only from the handle, not the whole row', () => {
    mount();
    const draggable = host!.querySelectorAll('[draggable="true"]');
    expect(draggable).toHaveLength(3);
    for (const handle of draggable) expect(handle.tagName).not.toBe('LI');
  });

  it('ignores a drop that is not a show row', () => {
    mount();
    const dataTransfer = new FakeDataTransfer();
    dataTransfer.setData('text/plain', 'from outside');
    drag('drop', rowItems()[0]!, dataTransfer);
    expect(editor!.state.rows.map((r) => r.id)).toEqual(['a1', 'a2', 'r1']);
  });
});
