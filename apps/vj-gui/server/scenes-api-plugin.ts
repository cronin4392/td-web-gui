import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import { scenesRoot } from '../src/scenes.config';
import { openScenesDb, readCatalog, scenesDbPath, syncScenes } from './scenes-db';
import { routePath, sendError, sendJson, sqliteApiPlugin } from './api-plugin';

const ROUTE = '/api/scenes';
const SYNC_PATH = '/sync';

export function scenesApiHandler(getDb: () => DatabaseSync): Connect.NextHandleFunction {
  return (req, res, next) => {
    function respond(work: (db: DatabaseSync) => unknown): void {
      try {
        sendJson(res, work(getDb()));
      } catch (err) {
        sendError(res, 500, err);
      }
    }

    const path = routePath(req);

    if (req.method === 'POST' && path === SYNC_PATH) {
      respond((db) => {
        syncScenes(db, scenesRoot(process.env));
        return readCatalog(db);
      });
      return;
    }

    if (req.method === 'GET' && path === '') {
      respond(readCatalog);
      return;
    }

    next();
  };
}

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
