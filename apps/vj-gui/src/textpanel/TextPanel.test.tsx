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

function mount(initial: TextState) {
  const t = (textState = createTextStateStore({ initial }));
  const wordbank = createWordbankStore({ uiStorage: undefined });
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(() => <TextPanel store={wordbank} textState={t} />, host);
  return t;
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

function pressTab(el: HTMLTextAreaElement): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

function toggle(): HTMLButtonElement | undefined {
  return [...host!.querySelectorAll('button')].find((b) => b.hasAttribute('aria-expanded'));
}

describe('TextPanel', () => {
  it('shows only the first two fields while collapsed', () => {
    mount(state(['a', 'b', 'c', 'd']));
    expect(fields()).toHaveLength(2);
    expect(toggle()?.textContent).toBe('▾ All texts');
  });

  it('expands into Text 3 on Tab out of a just-typed Text 2', () => {
    const t = mount(state(['a'], ['X']));
    type(field(2), 'Y');

    expect(pressTab(field(2))).toBe(true);
    expect(fields()).toHaveLength(3);
    expect(document.activeElement).toBe(field(3));
    expect(t.state.overrides.A).toEqual(['X', 'Y']);
  });

  it('expands into Text 3 on Tab out of Text 2 on a layer with no overrides yet', () => {
    mount(state(['a']));
    type(field(1), 'X');
    pressTab(field(1));
    type(field(2), 'Y');

    expect(pressTab(field(2))).toBe(true);
    expect(document.activeElement).toBe(field(3));
  });

  it('leaves Tab alone out of a filled Text 2 while Text 1 is blank', () => {
    mount(state(['a']));
    type(field(2), 'Y');

    expect(pressTab(field(2))).toBe(false);
    expect(fields()).toHaveLength(2);
  });

  it('leaves Tab alone out of a blank Text 2 with nothing past it', () => {
    mount(state(['a'], ['X']));
    field(2).focus();

    expect(pressTab(field(2))).toBe(false);
    expect(fields()).toHaveLength(2);
  });

  it('leaves Tab alone out of Text 1', () => {
    mount(state(['a', 'b', 'c']));
    field(1).focus();

    expect(pressTab(field(1))).toBe(false);
  });

  it('collapses back to two fields after a Tab expanded it', () => {
    mount(state([], ['X']));
    type(field(2), 'Y');
    pressTab(field(2));

    expect(toggle()?.textContent).toBe('▴ Fewer texts');
    toggle()!.click();
    expect(fields()).toHaveLength(2);
  });

  it('adds a next field on Tab out of the last filled one while expanded', () => {
    const t = mount(state([], ['X', 'Y']));
    field(2).focus();
    pressTab(field(2));
    type(field(3), 'Z');

    expect(pressTab(field(3))).toBe(true);
    expect(fields()).toHaveLength(4);
    expect(document.activeElement).toBe(field(4));
    expect(t.state.overrides.A).toEqual(['X', 'Y', 'Z']);
  });

  it('shows no spare field while a slot above it is blank', () => {
    mount(state(['a', 'b', 'c'], ['X', '', 'Z']));
    toggle()!.click();
    expect(fields()).toHaveLength(3);
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
