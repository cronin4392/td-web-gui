/**
 * Phrase-wordbank types + shape guards.
 *
 * Zero dependencies (no Solid, no DOM lib) so `server/` can import this module
 * directly alongside the client — one definition of "what a valid wordbank
 * looks like" shared across the `/api/wordbank` boundary.
 *
 * This is the data half of what used to be `StoredState`: the text fields,
 * lists, their phrases, and the recent list. `selectedListId` is UI state, not
 * wordbank content, and lives in `localStorage` on the client only (see
 * `store.ts`).
 */

export interface PhraseList {
  id: string;
  name: string;
  phrases: string[];
}

/**
 * One line of text the rig pushes to a Layer. Global to the rig: the Default is
 * shared by all twelve Layers, only the typed override is per-Layer.
 */
export interface TextField {
  id: string;
  defaultValue: string;
}

export interface Wordbank {
  /** Ordered; position `n` is the Layer text param `Text{n+1}` — see `wire.ts`. */
  fields: TextField[];
  lists: PhraseList[];
  recent: string[];
}

/**
 * How many Text fields the wire carries per Layer — and so the fewest a
 * wordbank may hold, since a shorter list strands a param nothing can reach.
 * Lives here rather than with the client's binding seam because the API
 * boundary has to reject a short list too.
 */
export const WIRED_FIELDS = 2;

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isPhraseList(x: unknown): x is PhraseList {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.name === 'string' && isStringArray(t.phrases);
}

function isTextField(x: unknown): x is TextField {
  if (typeof x !== 'object' || x === null) return false;
  const f = x as Record<string, unknown>;
  return typeof f.id === 'string' && typeof f.defaultValue === 'string';
}

export function isWordbank(x: unknown): x is Wordbank {
  if (typeof x !== 'object' || x === null) return false;
  const w = x as Record<string, unknown>;
  if (!Array.isArray(w.fields) || w.fields.length < WIRED_FIELDS || !w.fields.every(isTextField))
    return false;
  if (!Array.isArray(w.lists) || w.lists.length === 0 || !w.lists.every(isPhraseList)) return false;
  if (!isStringArray(w.recent)) return false;
  return true;
}

/** The two fields the wire already carries, an empty `List 1`, and no recent history. */
export function defaultWordbank(): Wordbank {
  return {
    fields: defaultTextFields(),
    lists: [{ id: crypto.randomUUID(), name: 'List 1', phrases: [] }],
    recent: [],
  };
}

/** The pair the wire already carries, so an upgraded install keeps the fields it had. */
export function defaultTextFields(): TextField[] {
  return Array.from({ length: WIRED_FIELDS }, () => ({
    id: crypto.randomUUID(),
    defaultValue: '',
  }));
}
