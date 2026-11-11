import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import { isTextState } from '../../domain/textstate/textstate';
import { openTextStateDb, readTextState, textStateDbPath, writeTextState } from './textstate-db';
import { readBody, sendError, sendJson, sqliteApiPlugin } from '../platform/api-plugin';

const ROUTE = '/api/textstate';

export function textStateApiHandler(getDb: () => DatabaseSync): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, readTextState(getDb()));
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
      if (!isTextState(body)) {
        sendError(res, 400, 'invalid text state shape');
        return;
      }
      try {
        writeTextState(getDb(), body);
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

export function vjGuiTextStateApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-textstate-api',
    route: ROUTE,
    openDb: () => openTextStateDb(textStateDbPath()),
    handler: textStateApiHandler,
  });
}
