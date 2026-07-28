/**
 * Phrase-wordbank types + shape guards (TEXT_SELECTOR.md §5 "Storage").
 *
 * Zero dependencies (no Solid, no DOM lib) so `server/` can import this module
 * directly alongside the client — one definition of "what a valid wordbank
 * looks like" shared across the `/api/wordbank` boundary.
 *
 * This is the data half of what used to be `StoredState`: lists, their
 * phrases, and the recent list. `selectedListId` is UI state, not wordbank
 * content, and lives in `localStorage` on the client only (see `store.ts`).
 */

export interface PhraseList {
  id: string;
  name: string;
  phrases: string[];
}

export interface Wordbank {
  lists: PhraseList[];
  recent: string[];
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isPhraseList(x: unknown): x is PhraseList {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.name === 'string' && isStringArray(t.phrases);
}

export function isWordbank(x: unknown): x is Wordbank {
  if (typeof x !== 'object' || x === null) return false;
  const w = x as Record<string, unknown>;
  if (!Array.isArray(w.lists) || w.lists.length === 0 || !w.lists.every(isPhraseList)) return false;
  if (!isStringArray(w.recent)) return false;
  return true;
}

/** A single empty `List 1` list and no recent history — the always-at-least-one-list baseline. */
export function defaultWordbank(): Wordbank {
  return { lists: [{ id: crypto.randomUUID(), name: 'List 1', phrases: [] }], recent: [] };
}
