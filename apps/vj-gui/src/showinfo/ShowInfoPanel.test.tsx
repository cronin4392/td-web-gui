import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShowDocument } from '@domain/showinfo/showinfo';
import { createShowInfoStore, type ShowInfoStore } from './store';
import { ShowInfoPanel } from './ShowInfoPanel';

function doc(): ShowDocument {
  return {
    show: {
      rows: [
        { id: 'a1', alias: 'artist', text: 'Amy', on: true },
        { id: 'a2', alias: 'artist', text: 'Bo', on: false },
        { id: 'r1', alias: 'event', text: 'Elements', on: true },
      ],
    },
    overrides: {},
  };
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let store: ShowInfoStore | undefined;

afterEach(() => {
  dispose?.();
  store?.dispose();
  host?.remove();
  dispose = store = host = undefined;
});

function mount() {
  store = createShowInfoStore({ initial: doc() });
  host = document.createElement('div');
  document.body.appendChild(host);
  const s = store;
  dispose = render(() => <ShowInfoPanel store={s} />, host);
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
    expect(store!.state.show.rows[1]!.text).toBe('Bea');
  });
});
