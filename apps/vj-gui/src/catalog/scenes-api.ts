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

/**
 * Every mutation route answers with the catalog that resulted, so one helper
 * covers all of them. All reject rather than falling back: each is an explicit
 * request, so the user needs to see why it failed — the server's own message,
 * which names the tag or scene it could not find.
 */
async function mutate(path: string, body: unknown, verb: string): Promise<Catalog> {
  const res = await fetch(`${ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `${verb} failed (${res.status})`);
  const parsed: unknown = await res.json();
  if (!isCatalog(parsed)) throw new Error(`${verb} response failed shape validation`);
  return parsed;
}

export async function syncCatalog(): Promise<Catalog> {
  const res = await fetch(`${ENDPOINT}/sync`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.text()) || `sync failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isCatalog(body)) throw new Error('sync response failed shape validation');
  return body;
}

export function setSceneHidden(name: string, hidden: boolean): Promise<Catalog> {
  return mutate('hidden', { name, value: hidden }, 'hide');
}

export function createTag(name: string): Promise<Catalog> {
  return mutate('tags/create', { name }, 'create');
}

export function renameTag(name: string, to: string): Promise<Catalog> {
  return mutate('tags/rename', { name, to }, 'rename');
}

export function deleteTag(name: string): Promise<Catalog> {
  return mutate('tags/delete', { name }, 'delete');
}

/** The whole list, not a from/to pair — the picker already knows the order it
 * wants, and a full list can't drift out of step with the catalog. */
export function setTagOrder(names: string[]): Promise<Catalog> {
  return mutate('tags/order', { names }, 'reorder');
}

export function setSceneTag(scene: string, tag: string, tagged: boolean): Promise<Catalog> {
  return mutate('tagged', { scene, tag, value: tagged }, 'tag');
}
