import { isEffectCatalog, type EffectCatalog } from '@domain/catalog/effect';

const ENDPOINT = '/api/effects';

/** Falls back to an empty catalog on any failure — network, bad JSON, or a
 * response that fails shape validation — so a bad boot leaves the rest of the
 * GUI usable. */
export async function fetchEffectCatalog(): Promise<EffectCatalog> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isEffectCatalog(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn('[vj-gui] failed to load the effect catalog', err);
    return [];
  }
}

/** Rebuilds the catalog from the effect folders on disk and returns the rebuilt
 * catalog. Rejects rather than falling back — a refresh is an explicit request,
 * so the user needs to see why it failed. */
export async function syncEffectCatalog(): Promise<EffectCatalog> {
  const res = await fetch(`${ENDPOINT}/sync`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.text()) || `sync failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isEffectCatalog(body)) throw new Error('sync response failed shape validation');
  return body;
}
