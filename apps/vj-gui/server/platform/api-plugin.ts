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

/**
 * One mutation route, in two phases. Reading the body is the caller's chance to
 * reject it — throwing here is a 400 and the message reaches the client — and
 * the thunk it returns is the mutation itself, where a throw is a 500. Splitting
 * them is what keeps "you sent nonsense" and "the catalog moved under you"
 * distinguishable on a route the handler knows nothing else about.
 */
export type CatalogAction = (body: unknown) => (db: DatabaseSync) => void;

interface FlagRequest {
  name: string;
  value: boolean;
}

function isFlagRequest(x: unknown): x is FlagRequest {
  if (typeof x !== 'object' || x === null) return false;
  const body = x as Record<string, unknown>;
  return typeof body.name === 'string' && body.name !== '' && typeof body.value === 'boolean';
}

function flagAction(set: (db: DatabaseSync, name: string, value: boolean) => void): CatalogAction {
  return (body) => {
    if (!isFlagRequest(body)) throw new Error('expected { name: string, value: boolean }');
    return (db) => set(db, body.name, body.value);
  };
}

/** `GET ''` reads the catalog, `POST /sync` reconciles it against disk, and
 * `POST /<flag>` or `POST /<action>` mutates it — flags being the special case of
 * an action whose body is one named boolean. Each POST answers with the catalog
 * that resulted, so the client needs no second read; that promise is the reason
 * every route lands here rather than in a plugin of its own. Anything else falls
 * through to the next middleware. */
export function catalogApiHandler(config: {
  read: (db: DatabaseSync) => unknown;
  sync: (db: DatabaseSync) => void;
  flags: Record<string, (db: DatabaseSync, name: string, value: boolean) => void>;
  actions?: Record<string, CatalogAction>;
}): (getDb: () => DatabaseSync) => Connect.NextHandleFunction {
  // One Map, so two routes can never share a key and resolve by check order, and
  // so a route named after an Object.prototype member can't resolve at all.
  const routes = new Map<string, CatalogAction>([
    ...Object.entries(config.flags).map(([name, set]): [string, CatalogAction] => [
      name,
      flagAction(set),
    ]),
    ...Object.entries(config.actions ?? {}),
  ]);

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

    const action = req.method === 'POST' ? routes.get(path.replace(/^\//, '')) : undefined;
    if (action) {
      let mutate: (db: DatabaseSync) => void;
      try {
        mutate = action(JSON.parse(await readBody(req)));
      } catch (err) {
        sendError(res, 400, err instanceof SyntaxError ? 'malformed JSON' : err);
        return;
      }
      respond((db) => {
        mutate(db);
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
