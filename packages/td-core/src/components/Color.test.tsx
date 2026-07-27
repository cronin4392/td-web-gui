/**
 * Color behavior: `<Vector>`'s color-specialized sibling — a
 * native `<input type="color">` (hex) for RGB plus an optional 0-1 alpha
 * slider, both mapping to/from the `[r,g,b(,a)]` 0-1 float array TD expects.
 * Throttled by default like `<Vector>`/`<Range>`.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';
import { createManualScheduler } from '../testing/scheduler';

interface Params {
  color: number[];
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

async function setup(snapshot: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  const td = createMockTD({ snapshot });
  const sched = createManualScheduler();
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider
        url="ws://test"
        options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
      >
        <TD.Color name="color" data-testid="color" {...attrs} />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  const rgb = host.querySelector<HTMLInputElement>('[data-testid="color"] .td-color-rgb')!;
  const alphaEl = host.querySelector<HTMLInputElement>('[data-testid="color"] .td-color-alpha');
  return { td, sched, rgb, alphaEl };
}

function input(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function updates(td: ReturnType<typeof createMockTD>) {
  return td.socket().received.filter((m: any) => m?.type === 'update');
}

describe('Color', () => {
  it('reflects the snapshot as hex', async () => {
    const { rgb } = await setup({ color: [1, 0, 0] });
    expect(rgb.value).toBe('#ff0000');
  });

  it('sends the rgb array (throttled by default) on input', async () => {
    const { td, sched, rgb } = await setup({ color: [0, 0, 0] });

    rgb.focus();
    input(rgb, '#00ff00');
    expect(updates(td)).toHaveLength(0);

    sched.flushFrame();
    expect(updates(td)).toEqual([{ type: 'update', params: { color: [0, 1, 0] } }]);
  });

  it('sends immediately when throttle is disabled', async () => {
    const { td, rgb } = await setup({ color: [0, 0, 0] }, { throttle: false });

    rgb.focus();
    input(rgb, '#0000ff');
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { color: [0, 0, 1] } });
  });

  it('has no alpha slider by default', async () => {
    const { alphaEl } = await setup({ color: [0, 0, 0] });
    expect(alphaEl).toBeNull();
  });

  it('renders an alpha slider and preserves rgb when only alpha changes', async () => {
    const { td, alphaEl } = await setup({ color: [1, 0, 0, 1] }, { alpha: true, throttle: false });
    expect(alphaEl).not.toBeNull();
    expect(alphaEl!.value).toBe('1');

    alphaEl!.focus();
    input(alphaEl!, '0.5');
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { color: [1, 0, 0, 0.5] } });
  });

  it('reflects TD-side changes when idle', async () => {
    const { td, rgb } = await setup({ color: [0, 0, 0] });
    td.socket().serverSend({ type: 'update', params: { color: [1, 1, 1] } });
    expect(rgb.value).toBe('#ffffff');
  });

  it('suppresses TD echoes while focused', async () => {
    const { td, rgb } = await setup({ color: [0, 0, 0] }, { throttle: false });

    rgb.focus();
    input(rgb, '#00ff00');
    td.socket().serverSend({ type: 'update', params: { color: [1, 0, 0] } });
    expect(rgb.value).toBe('#00ff00');
  });

  it('disables when bound to a read-only param', async () => {
    const td = createMockTD({ snapshot: { color: [0, 0, 0] } });
    const TD = createTDClient<Params>();
    host = document.createElement('div');
    document.body.appendChild(host);
    dispose = render(
      () => (
        <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }} readonly={['color']}>
          <TD.Color name="color" alpha data-testid="color" />
        </TD.Provider>
      ),
      host,
    );
    await flush();
    const rgb = host.querySelector<HTMLInputElement>('[data-testid="color"] .td-color-rgb')!;
    const alphaEl = host.querySelector<HTMLInputElement>('[data-testid="color"] .td-color-alpha')!;
    expect(rgb.disabled).toBe(true);
    expect(alphaEl.disabled).toBe(true);
  });
});
