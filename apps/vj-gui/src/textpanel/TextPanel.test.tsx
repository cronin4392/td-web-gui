import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextState } from '@domain/textstate/textstate';
import { createTextStateStore, type TextStateStore } from '@/textstate/store';
import { createWordbankStore } from '@/wordbank/store';
import { TextPanel } from './TextPanel';

vi.mock('@/playback/PlaybackProvider', () => ({
  usePlayback: () => ({ selectedLayer: () => 'A' }),
}));

function state(act: string[], overrides: string[] = []): TextState {
  return {
    show: { rows: act.map((text, i) => ({ id: `r${i}`, alias: null, text, on: true })) },
    overrides: { A: overrides },
  };
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let textState: TextStateStore | undefined;

afterEach(() => {
  dispose?.();
  textState?.dispose();
  host?.remove();
  dispose = textState = host = undefined;
});

function mount(initial: TextState, phrases: string[] = []) {
  const t = (textState = createTextStateStore({ initial }));
  const wordbank = createWordbankStore({
    initial: { lists: [{ id: 'list', name: 'List', phrases }], recent: [] },
    uiStorage: undefined,
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(() => <TextPanel wordbank={wordbank} textState={t} />, host);
  return { textState: t, wordbank };
}

function fields(): HTMLTextAreaElement[] {
  return [...host!.querySelectorAll('textarea')];
}

function field(n: number): HTMLTextAreaElement {
  const el = fields()[n - 1];
  if (!el) throw new Error(`no Text ${n} field`);
  return el;
}

function type(el: HTMLTextAreaElement, text: string) {
  el.focus();
  el.value = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function pressKey(el: HTMLTextAreaElement, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

function pressTab(el: HTMLTextAreaElement): boolean {
  return pressKey(el, 'Tab');
}

function button(text: string): HTMLButtonElement | undefined {
  return [...host!.querySelectorAll('button')].find((b) => b.textContent === text);
}

function toggle(): HTMLButtonElement | undefined {
  return [...host!.querySelectorAll('button')].find((b) => b.textContent?.endsWith(' texts'));
}

function chips(): string[] {
  return [...host!.querySelectorAll('button[draggable]')].map((b) => b.textContent ?? '');
}

/** A real click: the press lands first and takes focus from the field, as a browser does. */
function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  el.click();
}

describe('TextPanel fields', () => {
  it('shows only the first two fields while collapsed', () => {
    mount(state(['a', 'b', 'c', 'd']));
    expect(fields()).toHaveLength(2);
    expect(toggle()?.textContent).toBe('▾ All texts');
  });

  it('shows a field for every text slot once expanded', () => {
    mount(state(['a', 'b', 'c', 'd']));
    toggle()!.click();
    expect(fields()).toHaveLength(4);
    expect(toggle()?.textContent).toBe('▴ Fewer texts');
  });

  it('offers no toggle with nothing past Text 2', () => {
    mount(state(['a'], ['X', 'Y']));
    expect(toggle()).toBeUndefined();
  });

  it('hints the act text list while the layer has no override', () => {
    mount(state(['Amy', 'Ben']));
    expect(fields().map((f) => f.placeholder)).toEqual(['Amy', 'Ben']);
  });

  it('hints only the slot name once the layer has an override', () => {
    mount(state(['Amy', 'Ben'], ['X']));
    expect(field(2).placeholder).toBe('Text 2');
  });
});

describe('TextPanel Tab key', () => {
  it('expands into a hidden Text 3 the act text list reaches', () => {
    mount(state(['a', 'b', 'c']));
    field(2).focus();

    expect(pressTab(field(2))).toBe(true);
    expect(fields()).toHaveLength(3);
    expect(document.activeElement).toBe(field(3));
  });

  it('expands into a new Text 3 out of a just-typed Text 2, applying it', () => {
    const { textState } = mount(state(['a'], ['X']));
    type(field(2), 'Y');

    expect(pressTab(field(2))).toBe(true);
    expect(fields()).toHaveLength(3);
    expect(document.activeElement).toBe(field(3));
    expect(textState.state.overrides.A).toEqual(['X', 'Y']);
  });

  it('expands into a new Text 3 on a layer with no overrides yet', () => {
    mount(state(['a']));
    type(field(1), 'X');
    type(field(2), 'Y');

    expect(pressTab(field(2))).toBe(true);
    expect(document.activeElement).toBe(field(3));
  });

  it('adds a next field out of the last filled one while expanded', () => {
    const { textState } = mount(state([], ['X', 'Y']));
    field(2).focus();
    pressTab(field(2));
    type(field(3), 'Z');

    expect(pressTab(field(3))).toBe(true);
    expect(fields()).toHaveLength(4);
    expect(document.activeElement).toBe(field(4));
    expect(textState.state.overrides.A).toEqual(['X', 'Y', 'Z']);
  });

  it('collapses back to two fields after a Tab expanded it', () => {
    mount(state([], ['X']));
    type(field(2), 'Y');
    pressTab(field(2));

    toggle()!.click();
    expect(fields()).toHaveLength(2);
  });

  it('is left alone out of the last field with no next slot to open', () => {
    mount(state(['a'], ['X']));
    field(2).focus();

    expect(pressTab(field(2))).toBe(false);
    expect(fields()).toHaveLength(2);
  });

  it('is left alone out of a field that is not the last', () => {
    mount(state(['a', 'b', 'c']));
    field(1).focus();

    expect(pressTab(field(1))).toBe(false);
  });

  it('is left alone with Shift held', () => {
    mount(state(['a', 'b', 'c']));
    field(2).focus();

    expect(pressKey(field(2), 'Tab', { shiftKey: true })).toBe(false);
    expect(fields()).toHaveLength(2);
  });
});

describe('TextPanel apply', () => {
  it('applies what was typed on leaving the field, and records it in Recent', () => {
    const { textState, wordbank } = mount(state(['a']));
    type(field(2), 'Hello');
    field(2).blur();

    expect(textState.state.overrides.A).toEqual(['', 'Hello']);
    expect(wordbank.state.recent).toEqual(['Hello']);
  });

  it('applies on Enter and closes the search', () => {
    const { textState } = mount(state([]), ['Hello', 'World']);
    type(field(1), 'wor');
    expect(chips()).toEqual(['World']);

    pressKey(field(1), 'Enter');
    expect(textState.state.overrides.A).toEqual(['wor']);
    expect(chips()).toEqual(['Hello', 'World']);
  });

  it('drops what was typed on Escape and closes the search', () => {
    const { textState, wordbank } = mount(state([], ['X']), ['Hello', 'World']);
    type(field(1), 'wor');
    pressKey(field(1), 'Escape');
    field(1).blur();

    expect(field(1).value).toBe('X');
    expect(chips()).toEqual(['Hello', 'World']);
    expect(textState.state.overrides.A).toEqual(['X']);
    expect(wordbank.state.recent).toEqual([]);
  });

  it('stores a multi-line text with its newlines escaped', () => {
    const { textState } = mount(state([]));
    type(field(1), 'one\ntwo');
    field(1).blur();

    expect(textState.state.overrides.A).toEqual(['one\\ntwo']);
  });
});

describe('TextPanel pick', () => {
  it('goes to Text 1 with no field focused', () => {
    const { textState, wordbank } = mount(state([]), ['Hello']);
    click(button('Hello')!);

    expect(textState.state.overrides.A).toEqual(['Hello']);
    expect(wordbank.state.recent).toEqual(['Hello']);
  });

  it('goes to the field that was focused when the press landed', () => {
    const { textState } = mount(state([]), ['Hello']);
    field(2).focus();
    click(button('Hello')!);

    expect(textState.state.overrides.A).toEqual(['', 'Hello']);
  });

  it('replaces what was typed with the search result picked', () => {
    const { textState, wordbank } = mount(state([]), ['Hello', 'World']);
    type(field(2), 'wor');
    click(button('World')!);

    expect(textState.state.overrides.A).toEqual(['', 'World']);
    expect(field(2).value).toBe('World');
    expect(wordbank.state.recent).toEqual(['World']);
    expect(chips()).toEqual(['Hello', 'World']);
  });
  it('closes the search when a dragged result is dropped on nothing', () => {
    const { textState } = mount(state([], ['X']), ['Hello', 'World']);
    type(field(2), 'wor');
    const chip = button('World')!;
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    field(2).blur();
    chip.dispatchEvent(new Event('dragend', { bubbles: true }));

    expect(chips()).toEqual(['Hello', 'World']);
    expect(field(2).value).toBe('');
    expect(textState.state.overrides.A).toEqual(['X']);
  });
});

describe('TextPanel clear', () => {
  it('Clear text blanks that one override and records nothing in Recent', () => {
    const { textState, wordbank } = mount(state([], ['X', 'Y']));
    host!.querySelector<HTMLButtonElement>('button[title="Clear Text 1"]')!.click();

    expect(textState.state.overrides.A).toEqual(['', 'Y']);
    expect(wordbank.state.recent).toEqual([]);
  });

  it('Clear overrides removes every override without applying what was typed', () => {
    const { textState, wordbank } = mount(state(['a'], ['X', 'Y']));
    type(field(1), 'typed');
    click(button('Clear overrides')!);

    expect(textState.state.overrides.A).toBeUndefined();
    expect(fields().map((f) => f.value)).toEqual(['', '']);
    expect(wordbank.state.recent).toEqual([]);
  });
});
