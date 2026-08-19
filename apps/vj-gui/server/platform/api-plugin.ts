import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

export function sendJson(res: ServerResponse, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, status: number, err: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.end(err instanceof Error ? err.message : String(err));
}

/** connect has already stripped the mount route off `req.url`. */
export function routePath(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0]!.replace(/\/+$/, '');
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const SYNC_PATH = '/sync';
const HIDDEN_PATH = '/hidden';

interface HiddenRequest {
  name: string;
  hidden: boolean;
}

function isHiddenRequest(x: unknown): x is HiddenRequest {
  if (typeof x !== 'object' || x === null) return false;
  const body = x as Record<string, unknown>;
  return typeof body.name === 'string' && body.name !== '' && typeof body.hidden === 'boolean';
}

/** `GET ''` reads the catalog, `POST /sync` reconciles it against disk, and
 * `POST /hidden` hides or unhides one entry by name; each of the two POSTs
 * answers with the catalog that resulted, so the client needs no second read.
 * Anything else falls through to the next middleware. */
export function catalogApiHandler(config: {
  read: (db: DatabaseSync) => unknown;
  sync: (db: DatabaseSync) => void;
  setHidden: (db: DatabaseSync, name: string, hidden: boolean) => void;
}): (getDb: () => DatabaseSync) => Connect.NextHandleFunction {
  return (getDb) => async (req, res, next) => {
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
        config.sync(db);
        return config.read(db);
      });
      return;
    }

    if (req.method === 'POST' && path === HIDDEN_PATH) {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendError(res, 400, 'malformed JSON');
        return;
      }
      if (!isHiddenRequest(body)) {
        sendError(res, 400, 'expected { name: string, hidden: boolean }');
        return;
      }
      respond((db) => {
        config.setHidden(db, body.name, body.hidden);
        return config.read(db);
      });
      return;
    }

    if (req.method === 'GET' && path === '') {
      respond(config.read);
      return;
    }

    next();
  };
}

export function sqliteApiPlugin(config: {
  name: string;
  route: string;
  openDb: (server: ViteDevServer | PreviewServer) => DatabaseSync;
  handler: (getDb: () => DatabaseSync) => Connect.NextHandleFunction;
}): Plugin {
  let db: DatabaseSync | undefined;

  function attach(server: ViteDevServer | PreviewServer): void {
    server.middlewares.use(
      config.route,
      config.handler(() => (db ??= config.openDb(server))),
    );
    server.httpServer?.once('close', () => {
      db?.close();
      db = undefined;
    });
  }

  return {
    name: config.name,
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
