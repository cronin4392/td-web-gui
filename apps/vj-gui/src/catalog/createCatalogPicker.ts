import { createResource, createSignal, type Accessor, type InitializedResource } from 'solid-js';
import { TDCallError } from 'td-core';

export interface CatalogPicker<T> {
  catalog: InitializedResource<T>;
  error: Accessor<string | undefined>;
  refreshing: Accessor<boolean>;
  showHidden: Accessor<boolean>;
  toggleShowHidden: () => void;
  refresh: () => Promise<void>;
  loadTox: (path: string) => Promise<void>;
  edit: (work: () => Promise<T>) => Promise<void>;
}

function reason(error: unknown): string {
  if (error instanceof TDCallError) return error.code;
  return error instanceof Error ? error.message : String(error);
}

/**
 * The picker state every catalog shares: the fetched catalog, a sync that
 * swaps in the server's result, a hidden-items toggle, and a load the caller has
 * already aimed at the right destination. The catalog is served by the dev/preview
 * server, but `config.load` goes straight to TD — the GUI is not in that path.
 * `edit` runs any catalog-returning mutation the caller names: which flag it
 * sets, and what the result means for the view, needs the catalog's shape —
 * which only the caller knows.
 */
export function createCatalogPicker<T>(config: {
  fetch: () => Promise<T>;
  sync: () => Promise<T>;
  initialValue: T;
  load: (path: string) => Promise<void>;
}): CatalogPicker<T> {
  const [catalog, { mutate }] = createResource(config.fetch, { initialValue: config.initialValue });
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [refreshing, setRefreshing] = createSignal(false);
  const [showHidden, setShowHidden] = createSignal(false);

  async function refresh(): Promise<void> {
    setError(undefined);
    setRefreshing(true);
    try {
      const synced = await config.sync();
      mutate(() => synced);
    } catch (err) {
      setError(`Refresh failed: ${reason(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  function toggleShowHidden(): void {
    setShowHidden((on) => !on);
  }

  async function loadTox(path: string): Promise<void> {
    setError(undefined);
    try {
      await config.load(path);
    } catch (err) {
      setError(`Load failed: ${reason(err)}`);
    }
  }

  async function edit(work: () => Promise<T>): Promise<void> {
    setError(undefined);
    try {
      const updated = await work();
      mutate(() => updated);
    } catch (err) {
      setError(`Edit failed: ${reason(err)}`);
    }
  }

  return { catalog, error, refreshing, showHidden, toggleShowHidden, refresh, loadTox, edit };
}
