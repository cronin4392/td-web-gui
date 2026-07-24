/**
 * `/api/library` client (TEXT_SELECTOR.md §5). Talks to the Vite-mounted,
 * SQLite-backed API (`server/plugin.ts`) — the browser never touches SQLite
 * directly.
 */

import { defaultLibrary, isLibrary, type Library } from './library'

const ENDPOINT = '/api/library'

/**
 * GET the library. Called once at startup (`index.tsx`), so failures are
 * warned directly rather than needing a warn-once flag; falls back to
 * `defaultLibrary()` on any failure — network, bad JSON, or a response that
 * fails shape validation — so a bad boot can't white-screen the app.
 */
export async function fetchLibrary(): Promise<Library> {
  try {
    const res = await fetch(ENDPOINT)
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`)
    const body: unknown = await res.json()
    if (!isLibrary(body)) throw new Error('response failed shape validation')
    return body
  } catch (err) {
    console.warn('[text-selector] failed to load library from server, starting with defaults', err)
    return defaultLibrary()
  }
}

/**
 * PUT the whole library. Rejects on failure — called from the store's
 * debounced writer on every mutation, so the warn-once/non-fatal handling
 * belongs there (one flag per store instance), not here.
 */
export async function saveLibrary(library: Library): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(library),
  })
  if (!res.ok) throw new Error(`PUT ${ENDPOINT} -> ${res.status}`)
}
