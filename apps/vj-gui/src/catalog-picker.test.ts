import { createRoot } from 'solid-js';
import { TDCallError } from 'td-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogPicker } from './catalog-picker';
import type { SceneConnections } from './td';
import type { SceneId } from './td.config';

const loadSceneOn = vi.hoisted(() => vi.fn());
vi.mock('./td', () => ({ loadSceneOn }));

type Catalog = string[];

const LAYER = 'scene1' as SceneId;
const CONNECTION = { call: vi.fn() } as unknown as NonNullable<SceneConnections[SceneId]>;

function picker(
  overrides: {
    fetch?: () => Promise<Catalog>;
    sync?: () => Promise<Catalog>;
    connections?: SceneConnections;
  } = {},
) {
  const state = { connections: overrides.connections ?? { [LAYER]: CONNECTION } };
  const api = createRoot(() =>
    createCatalogPicker<Catalog>({
      fetch: overrides.fetch ?? (() => Promise.resolve(['fetched'])),
      sync: overrides.sync ?? (() => Promise.resolve(['synced'])),
      initialValue: [],
      selectedLayer: () => LAYER,
      connections: () => state.connections,
    }),
  );
  return Object.assign(api, {
    connect: (connections: SceneConnections) => {
      state.connections = connections;
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('refresh', () => {
  it('replaces the catalog with the rebuilt one', async () => {
    const p = picker();

    await p.refresh();

    expect(p.catalog()).toEqual(['synced']);
    expect(p.error()).toBeUndefined();
  });

  it('reports a failed sync and leaves the previous catalog serving', async () => {
    const p = picker({ sync: () => Promise.reject(new Error('root is gone')) });
    await p.refresh();
    const afterFirst = p.catalog();

    expect(p.error()).toBe('Refresh failed: root is gone');
    expect(p.catalog()).toBe(afterFirst);
  });

  it('raises the refreshing flag for the duration and lowers it on failure too', async () => {
    const p = picker();
    const pending = p.refresh();
    expect(p.refreshing()).toBe(true);
    await pending;
    expect(p.refreshing()).toBe(false);

    const failing = picker({ sync: () => Promise.reject(new Error('nope')) });
    await failing.refresh();
    expect(failing.refreshing()).toBe(false);
  });
});

describe('loadTox', () => {
  it('sends the path to the selected layer connection', async () => {
    const p = picker();

    await p.loadTox('C:/Effects/Blur/Blur.tox');

    expect(loadSceneOn).toHaveBeenCalledWith(CONNECTION, 'C:/Effects/Blur/Blur.tox');
    expect(p.error()).toBeUndefined();
  });

  it('names the layer and skips the call when it has no connection', async () => {
    const p = picker({ connections: {} });

    await p.loadTox('C:/Effects/Blur/Blur.tox');

    expect(loadSceneOn).not.toHaveBeenCalled();
    expect(p.error()).toBe(`Layer ${LAYER} has no connected scene process`);
  });

  it('surfaces a TDCallError by its code rather than its message', async () => {
    loadSceneOn.mockRejectedValueOnce(new TDCallError('no_such_tox', 'loadScene', 'boom'));
    const p = picker();

    await p.loadTox('C:/gone.tox');

    expect(p.error()).toBe('Load failed: no_such_tox');
  });

  it('clears the stale error once the layer reconnects', async () => {
    const p = picker({ connections: {} });
    await p.loadTox('C:/a.tox');
    expect(p.error()).toBeDefined();

    p.connect({ [LAYER]: CONNECTION });
    await p.loadTox('C:/b.tox');

    expect(loadSceneOn).toHaveBeenCalledWith(CONNECTION, 'C:/b.tox');
    expect(p.error()).toBeUndefined();
  });
});
