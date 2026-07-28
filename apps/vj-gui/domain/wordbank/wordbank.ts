/**
 * Phrase-library types + shape guards (TEXT_SELECTOR.md §5 "Storage").
 *
 * Zero dependencies (no Solid, no DOM lib) so `server/` can import this module
 * directly alongside the client — one definition of "what a valid library
 * looks like" shared across the `/api/library` boundary.
 *
 * This is the data half of what used to be `StoredState`: tabs, their
 * phrases, and the recent list. `activeTabId` is UI state, not library
 * content, and lives in `localStorage` on the client only (see `store.ts`).
 */

export interface PhraseTab {
  id: string;
  name: string;
  phrases: string[];
}

export interface Library {
  tabs: PhraseTab[];
  recent: string[];
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isPhraseTab(x: unknown): x is PhraseTab {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.name === 'string' && isStringArray(t.phrases);
}

export function isLibrary(x: unknown): x is Library {
  if (typeof x !== 'object' || x === null) return false;
  const l = x as Record<string, unknown>;
  if (!Array.isArray(l.tabs) || l.tabs.length === 0 || !l.tabs.every(isPhraseTab)) return false;
  if (!isStringArray(l.recent)) return false;
  return true;
}

/** A single empty `List 1` tab and no recent history — the always-at-least-one-tab baseline. */
export function defaultLibrary(): Library {
  return { tabs: [{ id: crypto.randomUUID(), name: 'List 1', phrases: [] }], recent: [] };
}
