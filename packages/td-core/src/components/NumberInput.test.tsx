/**
 * NumberInput edge cases — invalid / empty numeric input:
 * never send NaN, hold-last-valid while empty/unparseable, clamp to min/max,
 * snap back on blur.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';

interface Params {
  level: number;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

async function setup(
  snapshot: Record<string, unknown>,
  attrs: Record<string, unknown> = {},
  providerProps: Record<string, unknown> = {},
) {
  const td = createMockTD({ snapshot });
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }} {...providerProps}>
        <TD.NumberInput name="level" data-testid="num" {...attrs} />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  const input = host.querySelector<HTMLInputElement>('[data-testid="num"]')!;
  return { td, input };
}

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('NumberInput', () => {
  it('sends nothing for empty or unparseable input (never NaN)', async () => {
    const { td, input } = await setup({ level: 5 });
    const before = td.socket().received.length;

    input.focus();
    type(input, '');
    type(input, 'abc');

    // No update sent; signal holds the last valid value.
    expect(td.socket().received.length).toBe(before);
    const sentValues = td
      .socket()
      .received.filter((m: any) => m?.type === 'update')
      .map((m: any) => m.params.level);
    expect(sentValues.every((v) => !Number.isNaN(v))).toBe(true);
  });

  it('clamps to min/max before sending', async () => {
    const { td, input } = await setup({ level: 5 }, { min: 0, max: 10 });

    input.focus();
    type(input, '999');
    expect(td.socket().received.at(-1)).toEqual({ type: 'update', params: { level: 10 } });

    type(input, '-50');
    expect(td.socket().received.at(-1)).toEqual({ type: 'update', params: { level: 0 } });
  });

  it('snaps back to the last valid value on blur', async () => {
    const { input } = await setup({ level: 5 });

    input.focus();
    type(input, '8');
    expect(input.value).toBe('8');

    // Clear the field, then blur — should revert to the signal's value (8).
    type(input, '');
    input.blur();
    expect(input.value).toBe('8');
  });

  it('reflects TD-side changes when not focused', async () => {
    const { td, input } = await setup({ level: 1 });
    expect(input.value).toBe('1');

    td.socket().serverSend({ type: 'update', params: { level: 42 } });
    expect(input.value).toBe('42');
  });

  it('disables when bound to a read-only param', async () => {
    const { input } = await setup({ level: 5 }, {}, { readonly: ['level'] });
    expect(input.disabled).toBe(true);
  });
});
