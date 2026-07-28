import type { Plugin } from 'vite';
import { effectsDbPath, effectsRoot, openEffectsDb, readEffects, syncEffects } from './effects-db';
import { catalogApiHandler, sqliteApiPlugin } from '../platform/api-plugin';

const ROUTE = '/api/effects';

export const effectsApiHandler = catalogApiHandler({
  read: readEffects,
  sync: (db) => syncEffects(db, effectsRoot(process.env)),
});

/** Opened on the first request, not at config load — `pnpm db:effects` loads this
 * config too, and an eager open would have the CLI and the plugin holding the
 * same file at once. */
export function vjGuiEffectsApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-effects-api',
    route: ROUTE,
    openDb: () => openEffectsDb(effectsDbPath()),
    handler: effectsApiHandler,
  });
}
