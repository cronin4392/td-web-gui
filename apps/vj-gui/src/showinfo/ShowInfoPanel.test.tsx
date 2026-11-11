import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShowDocument } from '@domain/showinfo/showinfo';
import { createShowInfoStore, type ShowInfoStore } from './store';
import { ShowInfoPanel } from './ShowInfoPanel';

function doc(): ShowDocument {
  return {
    show: {
      rows: [{ id: 'r1', alias: 'artist', text: '', on: true }],
      artists: [
        { id: 'a1', name: 'Amy', active: true },
        { id: 'a2', name: 'Bo', active: true },
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

function artistReadout() {
  const select = [...host!.querySelectorAll<HTMLSelectElement>('select[aria-label="Alias"]')].find(
    (el) => el.value === 'artist',
  );
  return select!.closest('li')!.querySelector('p')!.textContent;
}

function click(label: string) {
  host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
}

describe('ShowInfoPanel artist row', () => {
  it('lists every active artist', () => {
    mount();
    expect(artistReadout()).toBe('Amy · Bo');
  });

  it('drops an artist switched off while another stays on', () => {
    mount();
    click('Bo shown');
    expect(artistReadout()).toBe('Amy');
  });

  it('picks up a rename while the row stays non-empty', () => {
    mount();
    store!.setArtistName('a1', 'Ann');
    expect(artistReadout()).toBe('Ann · Bo');
  });
});
