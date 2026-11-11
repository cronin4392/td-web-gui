import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TextState } from '@domain/textstate/textstate';
import { ShowInfoDialog } from './ShowInfoDialog';
import { createTextStateStore, type TextStateStore } from './store';

function state(): TextState {
  return {
    show: { rows: [{ id: 'r1', alias: 'artist', text: 'Amy', on: true }] },
    overrides: {},
  };
}

const proto = HTMLDialogElement.prototype;
const native = { showModal: proto.showModal, close: proto.close };

beforeAll(() => {
  proto.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

afterAll(() => {
  Object.assign(proto, native);
});

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let store: TextStateStore | undefined;

afterEach(() => {
  dispose?.();
  store?.dispose();
  host?.remove();
  dispose = store = host = undefined;
});

function mount() {
  const s = (store = createTextStateStore({ initial: state() }));
  const [open, setOpen] = createSignal(false);
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => <ShowInfoDialog store={s} open={open()} onClose={() => setOpen(false)} />,
    host,
  );
  return { setOpen, dialog: () => host!.querySelector('dialog')! };
}

function typeInto(text: string) {
  const box = host!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Row text"]')!;
  box.value = text;
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

describe('ShowInfoDialog', () => {
  it('keeps edits out of the show until the dialog closes', () => {
    const { setOpen, dialog } = mount();
    setOpen(true);
    typeInto('Bea');
    expect(store!.state.show.rows[0]!.text).toBe('Amy');
    dialog().close();
    expect(store!.state.show.rows[0]!.text).toBe('Bea');
    expect(dialog().open).toBe(false);
  });

  it('starts each opening from the current show', () => {
    const { setOpen, dialog } = mount();
    setOpen(true);
    typeInto('Bea');
    dialog().close();
    store!.setShow({ rows: [{ id: 'r1', alias: 'artist', text: 'Cy', on: true }] });
    setOpen(true);
    const box = host!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Row text"]')!;
    expect(box.value).toBe('Cy');
  });
});
