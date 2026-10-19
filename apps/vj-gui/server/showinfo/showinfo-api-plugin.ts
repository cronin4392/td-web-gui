import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import { isShowDocument } from '../../domain/showinfo/showinfo';
import { openShowInfoDb, readShowDocument, showInfoDbPath, writeShowDocument } from './showinfo-db';
import { readBody, sendError, sendJson, sqliteApiPlugin } from '../platform/api-plugin';

const ROUTE = '/api/showinfo';

export function showInfoApiHandler(getDb: () => DatabaseSync): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, readShowDocument(getDb()));
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
      if (!isShowDocument(body)) {
        sendError(res, 400, 'invalid show document shape');
        return;
      }
      try {
        writeShowDocument(getDb(), body);
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

export function vjGuiShowInfoApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-showinfo-api',
    route: ROUTE,
    openDb: () => openShowInfoDb(showInfoDbPath()),
    handler: showInfoApiHandler,
  });
}
