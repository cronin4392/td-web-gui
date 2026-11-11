import { createRoot } from 'solid-js';
import { TDCallError } from 'td-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogPicker } from './createCatalogPicker';

type Catalog = string[];

function picker(
  overrides: {
    fetch?: () => Promise<Catalog>;
    sync?: () => Promise<Catalog>;
    load?: (path: string) => Promise<void>;
  } = {},
) {
  return createRoot(() =>
    createCatalogPicker<Catalog>({
      fetch: overrides.fetch ?? (() => Promise.resolve(['fetched'])),
      sync: overrides.sync ?? (() => Promise.resolve(['synced'])),
      initialValue: [],
      load: overrides.load ?? (() => Promise.resolve()),
    }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('refresh', () => {
  it('replaces the catalog with the synced one', async () => {
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
  it('delegates to the load callback with the given path', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const p = picker({ load });

    await p.loadTox('C:/Effects/Blur/Blur.tox');

    expect(load).toHaveBeenCalledWith('C:/Effects/Blur/Blur.tox');
    expect(p.error()).toBeUndefined();
  });

  it('surfaces a TDCallError by its code rather than its message', async () => {
    const load = vi.fn().mockRejectedValue(new TDCallError('no_such_tox', 'loadScene', 'boom'));
    const p = picker({ load });

    await p.loadTox('C:/gone.tox');

    expect(p.error()).toBe('Load failed: no_such_tox');
  });

  it('surfaces a plain load failure by its message', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Layer A has no connected scene process'));
    const p = picker({ load });

    await p.loadTox('C:/a.tox');

    expect(p.error()).toBe('Load failed: Layer A has no connected scene process');
  });

  it('clears a stale error on the next successful load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const p = picker({ load });

    await p.loadTox('C:/a.tox');
    expect(p.error()).toBeDefined();

    await p.loadTox('C:/b.tox');
    expect(p.error()).toBeUndefined();
  });
});

describe('showHidden', () => {
  it('starts off and toggles', () => {
    const p = picker();

    expect(p.showHidden()).toBe(false);
    p.toggleShowHidden();
    expect(p.showHidden()).toBe(true);
    p.toggleShowHidden();
    expect(p.showHidden()).toBe(false);
  });
});

describe('edit', () => {
  it('replaces the catalog with the one the edit answered with', async () => {
    const p = picker();

    await p.edit(() => Promise.resolve(['after']));

    expect(p.catalog()).toEqual(['after']);
    expect(p.error()).toBeUndefined();
  });

  it('reports a failure and leaves the previous catalog serving', async () => {
    const p = picker();
    await p.refresh();
    const afterRefresh = p.catalog();

    await p.edit(() => Promise.reject(new Error('db is locked')));

    expect(p.error()).toBe('Edit failed: db is locked');
    expect(p.catalog()).toBe(afterRefresh);
  });

  it('clears a stale error on the next successful edit', async () => {
    const p = picker();
    await p.edit(() => Promise.reject(new Error('boom')));
    expect(p.error()).toBeDefined();

    await p.edit(() => Promise.resolve(['after']));
    expect(p.error()).toBeUndefined();
  });
});
