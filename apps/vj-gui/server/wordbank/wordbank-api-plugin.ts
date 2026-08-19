/**
 * Vite plugin mounting `GET`/`PUT /api/wordbank` on both the dev and preview
 * servers (TEXT_SELECTOR.md §5), so `pnpm dev` and `pnpm preview` both work
 * with no second process to start. One SQLite connection per server
 * lifecycle, closed when the underlying HTTP server closes.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import { isWordbank } from '../../domain/wordbank/wordbank';
import { openWordbankDb, readWordbank, wordbankDbPath, writeWordbank } from './wordbank-db';
import { readBody, sendError, sendJson, sqliteApiPlugin } from '../platform/api-plugin';

const ROUTE = '/api/wordbank';

export function wordbankApiHandler(getDb: () => DatabaseSync): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, readWordbank(getDb()));
      } catch (err) {
        sendError(res, 500, err);
      }
      return;
    }

    if (req.method === 'PUT') {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendError(res, 400, 'malformed JSON');
        return;
      }
      if (!isWordbank(body)) {
        sendError(res, 400, 'invalid wordbank shape');
        return;
      }
      try {
        writeWordbank(getDb(), body);
        res.statusCode = 204;
        res.end();
      } catch (err) {
        sendError(res, 500, err);
      }
      return;
    }

    next();
  };
}

export function vjGuiWordbankApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-wordbank-api',
    route: ROUTE,
    openDb: () => openWordbankDb(wordbankDbPath()),
    handler: wordbankApiHandler,
  });
}
