/**
 * Vite plugin mounting `GET`/`PUT /api/library` on both the dev and preview
 * servers (TEXT_SELECTOR.md §5), so `pnpm dev` and `pnpm preview` both work
 * with no second process to start. One SQLite connection per server
 * lifecycle, closed when the underlying HTTP server closes.
 */

import type { IncomingMessage } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import { isLibrary } from '../domain/wordbank/wordbank';
import { openLibraryDb, readLibrary, resolveDbPath, writeLibrary } from './text-db';
import { sendError, sendJson, sqliteApiPlugin } from './api-plugin';

const ROUTE = '/api/library';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function libraryApiHandler(getDb: () => DatabaseSync): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, readLibrary(getDb()));
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
      if (!isLibrary(body)) {
        sendError(res, 400, 'invalid library shape');
        return;
      }
      try {
        writeLibrary(getDb(), body);
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

export function vjGuiLibraryApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-library-api',
    route: ROUTE,
    openDb: (server) => openLibraryDb(resolveDbPath(server.config.root)),
    handler: libraryApiHandler,
  });
}
