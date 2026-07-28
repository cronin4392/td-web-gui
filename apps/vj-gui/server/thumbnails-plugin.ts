/**
 * Serves `SCENES_ROUTE` out of the scene library on disk — it lives outside the
 * repo and outside Vite's served roots, so it needs its own route.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { SCENES_ROUTE } from '../domain/catalog/thumbnail';
import { scenesRoot } from './scenes-db';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export async function thumbnailsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  // Resolved per request, not at mount: an unset VJ_SCENES_ROOT should cost
  // thumbnails, not the whole dev server's startup.
  let root: string;
  try {
    root = resolve(scenesRoot(process.env));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : String(err));
    return;
  }

  // connect has already stripped SCENES_ROUTE off req.url here.
  const rel = decodeURIComponent((req.url ?? '').split('?')[0]!).replace(/^\/+/, '');
  const target = resolve(join(root, rel));
  const inside = relative(root, target);
  if (!rel || inside.startsWith('..') || inside.startsWith(`..${sep}`)) {
    res.statusCode = 403;
    res.end('outside the scene library');
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) {
      res.statusCode = 404;
      res.end('not a file');
      return;
    }
    res.setHeader('Content-Type', contentType(target));
    res.setHeader('Content-Length', String(info.size));
    // Thumbnails are regenerated in TD while the page stays open.
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(target).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('no such scene file');
  }
}

function mount(middlewares: Connect.Server): void {
  middlewares.use(SCENES_ROUTE, thumbnailsHandler);
}

export function vjGuiThumbnailsPlugin(): Plugin {
  return {
    name: 'vj-gui-thumbnails',
    configureServer: (server) => mount(server.middlewares),
    configurePreviewServer: (server) => mount(server.middlewares),
  };
}
