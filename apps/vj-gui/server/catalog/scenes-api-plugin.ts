import type { Plugin } from 'vite';
import {
  openScenesDb,
  readCatalog,
  scenesDbPath,
  scenesRoot,
  setSceneHidden,
  syncScenes,
} from './scenes-db';
import { catalogApiHandler, sqliteApiPlugin } from '../platform/api-plugin';

const ROUTE = '/api/scenes';

export const scenesApiHandler = catalogApiHandler({
  read: readCatalog,
  sync: (db) => syncScenes(db, scenesRoot(process.env)),
  setHidden: setSceneHidden,
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
