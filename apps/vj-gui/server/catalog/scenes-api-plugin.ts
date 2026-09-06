import type { Plugin } from 'vite';
import {
  createTag,
  deleteTag,
  openScenesDb,
  readCatalog,
  renameTag,
  scenesDbPath,
  scenesRoot,
  setSceneHidden,
  setSceneTag,
  setTagOrder,
  syncScenes,
} from './scenes-db';
import { catalogApiHandler, sqliteApiPlugin, type CatalogAction } from '../platform/api-plugin';

const ROUTE = '/api/scenes';

function fields(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('expected a JSON object');
  }
  return body as Record<string, unknown>;
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value === '') throw new Error(`expected ${key} to be a name`);
  return value;
}

/** Validates shape only. Whether the name is blank once trimmed, already taken,
 * or absent from the catalog is the database's call, and a 500 — the body was
 * well-formed, the catalog just disagreed with it. */
const tagActions: Record<string, CatalogAction> = {
  'tags/create': (body) => {
    const name = text(fields(body), 'name');
    return (db) => createTag(db, name);
  },

  'tags/rename': (body) => {
    const parsed = fields(body);
    const [name, to] = [text(parsed, 'name'), text(parsed, 'to')];
    return (db) => renameTag(db, name, to);
  },

  'tags/delete': (body) => {
    const name = text(fields(body), 'name');
    return (db) => deleteTag(db, name);
  },

  'tags/order': (body) => {
    const names = fields(body).names;
    if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) {
      throw new Error('expected { names: string[] }');
    }
    return (db) => setTagOrder(db, names as string[]);
  },

  // Flat like `hidden`, and named for the same reason: it is one authored
  // property of one scene, not an edit to the tag list.
  tagged: (body) => {
    const parsed = fields(body);
    const [scene, tag] = [text(parsed, 'scene'), text(parsed, 'tag')];
    if (typeof parsed.value !== 'boolean') throw new Error('expected value to be a boolean');
    const value = parsed.value;
    return (db) => setSceneTag(db, scene, tag, value);
  },
};

export const scenesApiHandler = catalogApiHandler({
  read: (db) => readCatalog(db, scenesRoot(process.env)),
  sync: (db) => syncScenes(db, scenesRoot(process.env)),
  flags: { hidden: setSceneHidden },
  actions: tagActions,
});

/** Opened on the first request, not at config load — `pnpm db:scenes` loads this
 * config too, and an eager open would have the CLI and the plugin holding the
 * same file at once. */
export function vjGuiScenesApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-scenes-api',
    route: ROUTE,
    openDb: () => openScenesDb(scenesDbPath()),
    handler: scenesApiHandler,
  });
}
