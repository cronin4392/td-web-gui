/**
 * Select behavior: dropdown bound to a TD Menu param, wire value
 * is the menu's string key, bidirectional, read-only disabling (4.10).
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';

interface Params {
  blendmode: string;
}

const options = [
  { value: 'add', label: 'Add' },
  { value: 'over', label: 'Over' },
  { value: 'multiply', label: 'Multiply' },
];

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
  providerProps: Record<string, unknown> = {},
) {
  const td = createMockTD({ snapshot });
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }} {...providerProps}>
        <TD.Select name="blendmode" options={options} data-testid="select" />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  const select = host.querySelector<HTMLSelectElement>('[data-testid="select"]')!;
  return { td, select };
}

describe('Select', () => {
  it('renders the web-authored options with the wire key as value', async () => {
    const { select } = await setup({ blendmode: 'over' });
    const rendered = Array.from(select.options).map((o) => ({ value: o.value, label: o.label }));
    expect(rendered).toEqual(options);
  });

  it('reflects the snapshot value on connect', async () => {
    const { select } = await setup({ blendmode: 'over' });
    expect(select.value).toBe('over');
  });

  it('sends the string key on change', async () => {
    const { td, select } = await setup({ blendmode: 'add' });

    select.focus();
    select.value = 'multiply';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(td.socket().received.at(-1)).toEqual({
      type: 'update',
      params: { blendmode: 'multiply' },
    });
  });

  it('suppresses TD echoes while focused', async () => {
    const { td, select } = await setup({ blendmode: 'add' });

    select.focus();
    select.value = 'multiply';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    td.socket().serverSend({ type: 'update', params: { blendmode: 'over' } });
    expect(select.value).toBe('multiply');
  });

  it('reflects TD-side changes when not focused', async () => {
    const { td, select } = await setup({ blendmode: 'add' });

    td.socket().serverSend({ type: 'update', params: { blendmode: 'over' } });
    expect(select.value).toBe('over');
  });

  it('disables when bound to a read-only param', async () => {
    const { select } = await setup({ blendmode: 'add' }, { readonly: ['blendmode'] });
    expect(select.disabled).toBe(true);
  });
});
