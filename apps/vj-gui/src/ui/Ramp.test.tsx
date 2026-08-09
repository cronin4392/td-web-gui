/**
 * The gradient reaches the DOM as an inline `background-image`, and the bar
 * stays in the layout when there is nothing to draw — a layer's controls must
 * not reflow the moment its scene process connects.
 */

import { render } from 'solid-js/web';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { Ramp } from './Ramp';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

function mount(ui: () => ReturnType<typeof Ramp>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host.querySelector<HTMLElement>('[role="img"]')!;
}

const BLACK_TO_WHITE = [
  ['0', '0', '0', '0', '1'],
  ['1', '1', '1', '1', '1'],
];

describe('Ramp', () => {
  it('paints the gradient and labels itself', () => {
    const bar = mount(() => <Ramp label="Layer A color ramp" keys={BLACK_TO_WHITE} />);
    expect(bar.getAttribute('aria-label')).toBe('Layer A color ramp');
    expect(bar.style.backgroundImage).toContain('linear-gradient');
  });

  it('still renders a bar with no keys to draw', () => {
    const bar = mount(() => <Ramp label="Layer A color ramp" keys={undefined} />);
    expect(bar).toBeTruthy();
    expect(bar.style.backgroundImage).toBe('');
  });

  it('repaints when TD broadcasts new keys', () => {
    const [keys, setKeys] = createSignal<string[][] | undefined>(undefined);
    const bar = mount(() => <Ramp label="Layer A color ramp" keys={keys()} />);
    expect(bar.style.backgroundImage).toBe('');
    setKeys(BLACK_TO_WHITE);
    expect(bar.style.backgroundImage).toContain('linear-gradient');
  });
});
