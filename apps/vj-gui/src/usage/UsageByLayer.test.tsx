import { render } from 'solid-js/web';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LayerScores } from '@domain/usage/usage';
import { UsageByLayer } from './UsageByLayer';

const proto = HTMLDialogElement.prototype;
const native = { showModal: proto.showModal, close: proto.close };

beforeAll(() => {
  proto.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterAll(() => {
  Object.assign(proto, native);
});

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  vi.unstubAllGlobals();
});

async function openWith(scores: LayerScores): Promise<HTMLDivElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(scores), { status: 200 })),
  );
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <UsageByLayer />, host);
  host.querySelector<HTMLButtonElement>('button[aria-label="Usage by layer"]')!.click();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/usage/layers'));
  await Promise.resolve();
  return host;
}

function texts(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? '');
}

describe('UsageByLayer', () => {
  it('gives each Layer a column and each rank a row', async () => {
    const view = await openWith({
      A: [
        { kind: 'scene', name: 'Lasers', score: 12.4 },
        { kind: 'effect', name: 'Blur', score: 3.25 },
      ],
      B: [{ kind: 'scene', name: 'Ticker', score: 0.5 }],
    });

    await vi.waitFor(() => expect(view.querySelectorAll('tbody tr')).toHaveLength(2));
    expect(texts(view, 'thead th')).toEqual(['#', '1', '2', '3', '4', '5', '6', '7', '8']);
    const [first, second] = [...view.querySelectorAll('tbody tr')];
    expect(texts(first!, 'td').slice(0, 2)).toEqual(['Lasers12', 'Ticker0.5']);
    expect(texts(second!, 'td').slice(0, 2)).toEqual(['BlurFX3.3', '']);
  });

  it('adds a column for a Z layer only once something has played on it', async () => {
    const view = await openWith({ Z2: [{ kind: 'scene', name: 'Logo', score: 40 }] });

    await vi.waitFor(() => expect(view.querySelectorAll('tbody tr')).toHaveLength(1));
    expect(texts(view, 'thead th')).toEqual(['#', '1', '2', '3', '4', '5', '6', '7', '8', 'Z2']);
  });

  it('says so when nothing is recorded', async () => {
    const view = await openWith({});
    expect(view.textContent).toContain('Nothing recorded yet');
  });
});
