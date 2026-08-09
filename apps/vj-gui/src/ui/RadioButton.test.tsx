/**
 * The radio is `sr-only` rather than absent, so the group must still behave
 * like a native radio group: grouped by `name`, labelled by its children, and
 * driven by clicks on the visible rectangle.
 */

import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadioButton } from './RadioButton';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

function mount(ui: () => ReturnType<typeof RadioButton>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host;
}

function radios() {
  return [...host!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

describe('RadioButton', () => {
  it('renders a radio grouped by name, labelled by its children', () => {
    mount(() => (
      <RadioButton name="tag" checked={false} onSelect={() => {}}>
        Ambient
      </RadioButton>
    ));

    const [input] = radios();
    expect(input!.name).toBe('tag');
    expect(input!.closest('label')!.textContent).toContain('Ambient');
  });

  it('selects when the visible rectangle is clicked, not just the input', () => {
    const onSelect = vi.fn();
    mount(() => (
      <RadioButton name="tag" checked={false} onSelect={onSelect}>
        Ambient
      </RadioButton>
    ));

    host!.querySelector('label')!.click();

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('tracks a changing checked prop', () => {
    const [checked, setChecked] = createSignal(false);
    mount(() => (
      <RadioButton name="tag" checked={checked()} onSelect={() => {}}>
        Ambient
      </RadioButton>
    ));

    expect(radios()[0]!.checked).toBe(false);
    setChecked(true);
    expect(radios()[0]!.checked).toBe(true);
  });
});
