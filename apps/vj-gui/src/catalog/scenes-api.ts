import { emptyCatalog, isCatalog, type Catalog } from '@domain/catalog/scene';

const ENDPOINT = '/api/scenes';

/** Falls back to an empty catalog on any failure — network, bad JSON, or a
 * response that fails shape validation — so a bad boot leaves the rest of the
 * GUI usable. */
export async function fetchCatalog(): Promise<Catalog> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isCatalog(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn('[vj-gui] failed to load the scene catalog', err);
    return emptyCatalog();
  }
}

/** Rejects rather than falling back — a refresh is an explicit request, so the
 * user needs to see why it failed. */
export async function syncCatalog(): Promise<Catalog> {
  const res = await fetch(`${ENDPOINT}/sync`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.text()) || `sync failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isCatalog(body)) throw new Error('sync response failed shape validation');
  return body;
}

/** Rejects rather than falling back — hiding is an explicit request, so the
 * user needs to see why it failed. */
export async function setSceneHidden(name: string, hidden: boolean): Promise<Catalog> {
  const res = await fetch(`${ENDPOINT}/hidden`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, hidden }),
  });
  if (!res.ok) throw new Error((await res.text()) || `hide failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isCatalog(body)) throw new Error('hide response failed shape validation');
  return body;
}
