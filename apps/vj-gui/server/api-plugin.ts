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
