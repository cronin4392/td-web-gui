/**
 * The group is what a native radio group needs: one shared `name` across its
 * radios, and an accessible name of its own.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { RadioGroup } from './RadioGroup';
import { RadioButton } from './RadioButton';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

function mount(ui: () => ReturnType<typeof RadioGroup>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(ui, host);
  return host;
}

function names() {
  return [...host!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((i) => i.name);
}

describe('RadioGroup', () => {
  it('names every radio in it, so they form one group', () => {
    mount(() => (
      <RadioGroup name="beat-period" direction="horizontal" label="Beat period">
        <RadioButton checked onSelect={() => {}}>
          1
        </RadioButton>
        <RadioButton checked={false} onSelect={() => {}}>
          2
        </RadioButton>
      </RadioGroup>
    ));

    expect(names()).toEqual(['beat-period', 'beat-period']);
    expect(host!.querySelector('fieldset')!.getAttribute('aria-label')).toBe('Beat period');
  });

  it('names a radio nested inside a wrapper', () => {
    mount(() => (
      <RadioGroup name="scene-tag" direction="horizontal" label="Scene tag">
        <div>
          <RadioButton checked={false} onSelect={() => {}}>
            Ambient
          </RadioButton>
        </div>
      </RadioGroup>
    ));

    expect(names()).toEqual(['scene-tag']);
  });

  it('lets a radio keep a name of its own', () => {
    mount(() => (
      <RadioGroup name="scene-tag" direction="horizontal" label="Scene tag">
        <RadioButton name="elsewhere" checked={false} onSelect={() => {}}>
          Ambient
        </RadioButton>
      </RadioGroup>
    ));

    expect(names()).toEqual(['elsewhere']);
  });
});
