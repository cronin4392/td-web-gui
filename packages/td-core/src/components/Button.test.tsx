/**
 * Button behavior across its three modes:
 *  - `pulse` (default): fire-and-forget `pulse` message, no synced state.
 *  - `hold`: momentary bool, pointer-capture + keyboard press/release, can't
 *    get stranded `true` (pointercancel/lostpointercapture/window blur release).
 *  - `toggle`: click flips a bool, same wire path as `<Toggle>`.
 *
 * jsdom in this project doesn't implement `PointerEvent` or
 * `setPointerCapture`, so pointer interactions are simulated with plain
 * `Event`s carrying a `pointerId` property, against a no-op
 * `setPointerCapture` shim.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';

interface Params {
  reset: boolean;
  gate: boolean;
  mute: boolean;
}

if (!(HTMLElement.prototype as any).setPointerCapture) {
  (HTMLElement.prototype as any).setPointerCapture = () => {};
}

function pointerEvent(type: string, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  (event as any).pointerId = pointerId;
  return event;
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
  mode: 'pulse' | 'hold' | 'toggle',
  name: keyof Params = mode === 'pulse' ? 'reset' : mode === 'hold' ? 'gate' : 'mute',
) {
  const td = createMockTD({ snapshot });
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider url="ws://test" options={{ WebSocket: td.WebSocket }}>
        <TD.Button name={name} mode={mode} data-testid="btn" />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  const button = host.querySelector<HTMLButtonElement>('[data-testid="btn"]')!;
  return { td, button };
}

function updates(td: ReturnType<typeof createMockTD>) {
  return td.socket().received.filter((m: any) => m?.type === 'update');
}

describe('Button mode="pulse"', () => {
  it('fires a pulse message on click, one per click', async () => {
    const { td, button } = await setup({}, 'pulse');

    button.click();
    expect(td.socket().received.at(-1)).toEqual({ type: 'pulse', name: 'reset' });

    button.click();
    button.click();
    expect(td.socket().received.filter((m: any) => m?.type === 'pulse')).toHaveLength(3);
    // Never an `update` — pulse holds no state.
    expect(updates(td)).toHaveLength(0);
  });
});

describe('Button mode="hold"', () => {
  it('sends true on press and false on release (pointer)', async () => {
    const { td, button } = await setup({ gate: false }, 'hold');

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: true } });

    button.dispatchEvent(pointerEvent('pointerup'));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: false } });
  });

  it('releases on pointercancel and lostpointercapture', async () => {
    const { td, button } = await setup({ gate: false }, 'hold');

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent('pointercancel'));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: false } });

    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: false } });
  });

  it('releases on window blur while held', async () => {
    const { td, button } = await setup({ gate: false }, 'hold');

    button.dispatchEvent(pointerEvent('pointerdown'));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: true } });

    window.dispatchEvent(new Event('blur'));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: false } });
  });

  it('responds to Space/Enter keydown/keyup, suppressing key-repeat', async () => {
    const { td, button } = await setup({ gate: false }, 'hold');

    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: true } });

    // Held-key repeat must not re-fire `true`.
    const before = updates(td).length;
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, repeat: true }),
    );
    expect(updates(td).length).toBe(before);

    button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { gate: false } });
  });

  it('reflects TD-side changes and carries pressed-state ARIA', async () => {
    const { td, button } = await setup({ gate: false }, 'hold');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    td.socket().serverSend({ type: 'update', params: { gate: true } });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Button mode="toggle"', () => {
  it('flips the bound bool on each click', async () => {
    const { td, button } = await setup({ mute: false }, 'toggle');

    button.click();
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { mute: true } });

    button.click();
    expect(updates(td).at(-1)).toEqual({ type: 'update', params: { mute: false } });
  });

  it('reflects TD-side changes', async () => {
    const { td, button } = await setup({ mute: false }, 'toggle');

    td.socket().serverSend({ type: 'update', params: { mute: true } });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
