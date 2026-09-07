/**
 * Toggle behavior: bidirectional bool checkbox, optimistic write +
 * send-on-change, focus-driven echo suppression, read-only disabling.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';

interface Params {
  enabled: boolean;
  fps: boolean;
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
  providerProps: Record<string, unknown> = {},
) {
  const td = createMockTD({ snapshot });
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }} {...providerProps}>
        <TD.Toggle name="enabled" data-testid="toggle" />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  const input = host.querySelector<HTMLInputElement>('[data-testid="toggle"]')!;
  return { td, input };
}

describe('Toggle', () => {
  it('reflects the snapshot value on connect', async () => {
    const { input } = await setup({ enabled: true });
    expect(input.checked).toBe(true);
  });

  it('sends an update on change', async () => {
    const { td, input } = await setup({ enabled: false });

    input.focus();
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(td.socket().received.at(-1)).toEqual({
      type: 'update',
      params: { enabled: true },
    });
  });

  it('suppresses TD echoes while focused', async () => {
    const { td, input } = await setup({ enabled: false });

    input.focus();
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    td.socket().serverSend({ type: 'update', params: { enabled: false } });
    expect(input.checked).toBe(true);
  });

  it('reflects TD-side changes when not focused', async () => {
    const { td, input } = await setup({ enabled: false });
    expect(input.checked).toBe(false);

    td.socket().serverSend({ type: 'update', params: { enabled: true } });
    expect(input.checked).toBe(true);
  });

  it('disables when bound to a read-only param', async () => {
    const { input } = await setup({ enabled: false }, { readonly: ['enabled'] });
    expect(input.disabled).toBe(true);
  });
});
