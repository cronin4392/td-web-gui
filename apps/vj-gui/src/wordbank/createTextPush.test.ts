import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, createSignal, type Accessor, type Setter } from 'solid-js';
import type { TDStatus } from 'td-core';
import { layerIds, type LayerId } from '@/playback/layers';
import type { LayerConnections, LoaderConnection } from '@/playback/clients';
import { createWordbankStore, type WordbankStore } from './store';
import { createTextPush } from './createTextPush';

interface FakeConnection {
  connection: LoaderConnection;
  setStatus: Setter<TDStatus>;
  /** Every `setTextList` payload this loader has been sent, oldest first. */
  pushes: string[][];
}

function fakeConnection(status: TDStatus = 'synced'): FakeConnection {
  const [current, setStatus] = createSignal<TDStatus>(status);
  const pushes: string[][] = [];
  const connection = {
    status: current,
    call: (name: string, args?: { lines: string[] }) => {
      if (name === 'setTextList') pushes.push(args!.lines);
      return Promise.resolve({ ok: true });
    },
  } as unknown as LoaderConnection;
  return { connection, setStatus, pushes };
}

let disposers: (() => void)[] = [];

interface Harness {
  store: WordbankStore;
  loaders: Record<string, FakeConnection>;
  setConnections: Setter<LayerConnections>;
}

/** A store and a fake loader per layer, all `synced` unless `status` says otherwise. */
function harness(status: TDStatus = 'synced'): Harness {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const store = createWordbankStore();
    disposers.push(store.dispose);

    const loaders: Record<string, FakeConnection> = {};
    const connections: LayerConnections = {};
    for (const layer of layerIds) {
      loaders[layer] = fakeConnection(status);
      connections[layer] = loaders[layer]!.connection;
    }
    const [read, setConnections] = createSignal<LayerConnections>(connections);
    createTextPush(store, read);
    return { store, loaders, setConnections };
  });
}

function pushesTo(h: Harness, layer: LayerId): string[][] {
  return h.loaders[layer]!.pushes;
}

/** The last payload every layer was sent. */
function lastPushes(h: Harness): (string[] | undefined)[] {
  return layerIds.map((layer) => pushesTo(h, layer).at(-1));
}

beforeEach(() => {
  disposers = [];
});

afterEach(() => {
  for (const dispose of disposers) dispose();
});

describe('createTextPush', () => {
  it('fills every synced loader with its resolved lines', () => {
    const h = harness();
    expect(lastPushes(h)).toEqual(layerIds.map(() => ['', '']));
  });

  it('pushes nothing to a loader that has not synced', () => {
    const h = harness('connecting');
    expect(pushesTo(h, 'A')).toHaveLength(0);
  });

  it('pushes nothing for a layer with no connected process', () => {
    const h = harness();
    expect(() => h.setConnections({})).not.toThrow();
    const before = pushesTo(h, 'A').length;
    h.store.setOverride('A', h.store.state.fields[0]!.id, 'GUEST SET');
    expect(pushesTo(h, 'A')).toHaveLength(before);
  });

  it('re-pushes when a loader reconnects', () => {
    const h = harness('connecting');
    h.store.setFieldDefault(h.store.state.fields[0]!.id, 'SOME ARTIST');
    expect(pushesTo(h, 'A')).toHaveLength(0);

    h.loaders.A!.setStatus('synced');
    expect(pushesTo(h, 'A')).toEqual([['SOME ARTIST', '']]);
  });

  it('sends an override only to the layer it belongs to', () => {
    const h = harness();
    const counts = layerIds.map((layer) => pushesTo(h, layer).length);

    h.store.setOverride('C', h.store.state.fields[0]!.id, 'GUEST SET');

    expect(pushesTo(h, 'C').at(-1)).toEqual(['GUEST SET', '']);
    for (const [index, layer] of layerIds.entries()) {
      if (layer === 'C') continue;
      expect(pushesTo(h, layer)).toHaveLength(counts[index]!);
    }
  });

  it('sends a Default to all twelve', () => {
    const h = harness();
    h.store.setFieldDefault(h.store.state.fields[0]!.id, 'SOME ARTIST');
    expect(lastPushes(h)).toEqual(layerIds.map(() => ['SOME ARTIST', '']));
  });

  it('an override outranks the Default on its own layer only', () => {
    const h = harness();
    const id = h.store.state.fields[0]!.id;
    h.store.setOverride('C', id, 'GUEST SET');
    h.store.setFieldDefault(id, 'SOME ARTIST');

    expect(pushesTo(h, 'C').at(-1)).toEqual(['GUEST SET', '']);
    expect(pushesTo(h, 'A').at(-1)).toEqual(['SOME ARTIST', '']);
  });

  it('falls back to the Default once the override is cleared', () => {
    const h = harness();
    const id = h.store.state.fields[0]!.id;
    h.store.setFieldDefault(id, 'SOME ARTIST');
    h.store.setOverride('C', id, 'GUEST SET');

    h.store.clearLayerOverrides('C');

    expect(pushesTo(h, 'C').at(-1)).toEqual(['SOME ARTIST', '']);
  });

  it('grows the list with the fields', () => {
    const h = harness();
    h.store.addField();
    expect(pushesTo(h, 'A').at(-1)).toEqual(['', '', '']);
  });

  it('escapes newlines for the wire', () => {
    const h = harness();
    h.store.setOverride('A', h.store.state.fields[0]!.id, 'GUEST\nSET');
    expect(pushesTo(h, 'A').at(-1)).toEqual(['GUEST\\nSET', '']);
  });

  it('warns rather than throwing when a loader refuses the call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createRoot((dispose) => {
      disposers.push(dispose);
      const store = createWordbankStore();
      disposers.push(store.dispose);
      const connection = {
        status: () => 'synced' as TDStatus,
        call: () => Promise.reject(new Error('unknown_handler')),
      } as unknown as LoaderConnection;
      createTextPush(store, (() => ({ A: connection })) as Accessor<LayerConnections>);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('[vj-gui] setTextList failed', 'A', expect.any(Error));
  });
});
