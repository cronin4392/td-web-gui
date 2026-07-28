import { createResource, createSignal, type Accessor, type InitializedResource } from 'solid-js';
import { TDCallError } from 'td-core';

export interface CatalogPicker<T> {
  catalog: InitializedResource<T>;
  error: Accessor<string | undefined>;
  refreshing: Accessor<boolean>;
  refresh: () => Promise<void>;
  loadTox: (path: string) => Promise<void>;
}

function reason(error: unknown): string {
  if (error instanceof TDCallError) return error.code;
  return error instanceof Error ? error.message : String(error);
}

/**
 * The picker state every catalog shares: the fetched catalog, a sync that
 * replaces it in place, and a load the caller has already aimed at the
 * right destination. The catalog is served by the dev/preview server, but
 * `config.load` goes straight to TD — the GUI is not in that path.
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

  async function refresh(): Promise<void> {
    setError(undefined);
    setRefreshing(true);
    try {
      const rebuilt = await config.sync();
      mutate(() => rebuilt);
    } catch (err) {
      setError(`Refresh failed: ${reason(err)}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadTox(path: string): Promise<void> {
    setError(undefined);
    try {
      await config.load(path);
    } catch (err) {
      setError(`Load failed: ${reason(err)}`);
    }
  }

  return { catalog, error, refreshing, refresh, loadTox };
}
