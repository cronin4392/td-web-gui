/**
 * Vite plugin mounting `GET`/`PUT /api/library` on both the dev and preview
 * servers (TEXT_SELECTOR.md §5), so `pnpm dev` and `pnpm preview` both work
 * with no second process to start. One SQLite connection per server
 * lifecycle, closed when the underlying HTTP server closes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { isLibrary } from '../src/library'
import { openLibraryDb, readLibrary, resolveDbPath, writeLibrary } from './db'

const ROUTE = '/api/library'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function mount(middlewares: Connect.Server, db: DatabaseSync): void {
  middlewares.use(ROUTE, async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(readLibrary(db)))
      return
    }

    if (req.method === 'PUT') {
      let body: unknown
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        res.statusCode = 400
        res.end('malformed JSON')
        return
      }
      if (!isLibrary(body)) {
        res.statusCode = 400
        res.end('invalid library shape')
        return
      }
      try {
        writeLibrary(db, body)
        res.statusCode = 204
        res.end()
      } catch (err) {
        res.statusCode = 500
        res.end(err instanceof Error ? err.message : 'write failed')
      }
      return
    }

    next()
  })
}

export function vjGuiDbPlugin(): Plugin {
  let db: DatabaseSync | undefined

  function attach(server: ViteDevServer | PreviewServer): void {
    db ??= openLibraryDb(resolveDbPath(server.config.root))
    mount(server.middlewares, db)
    server.httpServer?.once('close', () => {
      db?.close()
      db = undefined
    })
  }

  return {
    name: 'vj-gui-db',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
