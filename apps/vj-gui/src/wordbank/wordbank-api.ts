/**
 * `/api/wordbank` client (TEXT_SELECTOR.md §5). Talks to the Vite-mounted,
 * SQLite-backed API (`server/wordbank/wordbank-api-plugin.ts`) — the browser never touches SQLite
 * directly.
 */

import { defaultWordbank, isWordbank, type Wordbank } from '@domain/wordbank/wordbank';

const ENDPOINT = '/api/wordbank';

/**
 * GET the wordbank. Called once at startup (`index.tsx`), so failures are
 * warned directly rather than needing a warn-once flag; falls back to
 * `defaultWordbank()` on any failure — network, bad JSON, or a response that
 * fails shape validation — so a bad boot can't white-screen the app.
 */
export async function fetchWordbank(): Promise<Wordbank> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isWordbank(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn('[vj-gui] failed to load wordbank from server, starting with defaults', err);
    return defaultWordbank();
  }
}

/**
 * PUT the whole wordbank. Rejects on failure — called from the store's
 * debounced writer on every mutation, so the warn-once/non-fatal handling
 * belongs there (one flag per store instance), not here.
 */
export async function saveWordbank(wordbank: Wordbank): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wordbank),
  });
  if (!res.ok) throw new Error(`PUT ${ENDPOINT} -> ${res.status}`);
}
