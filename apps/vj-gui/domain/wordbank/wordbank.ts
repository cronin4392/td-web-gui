/**
 * Phrase-wordbank types + shape guards.
 *
 * Zero dependencies (no Solid, no DOM lib) so `server/` can import this module
 * directly alongside the client — one definition of "what a valid wordbank
 * looks like" shared across the `/api/wordbank` boundary.
 *
 * This is the data half of what used to be `StoredState`: the text fields,
 * their per-Layer overrides, the lists, their phrases, and the recent list.
 * `selectedListId` is UI state, not wordbank content, and lives in
 * `localStorage` on the client only (see `store.ts`).
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

/** Stringly keyed: this tier must not learn the browser's `LayerId` union. */
export type Overrides = Record<string, Record<string, string>>;

export interface Wordbank {
  /** Ordered; position `n` is line `n` of the list pushed to each scene. */
  fields: TextField[];
  overrides: Overrides;
  lists: PhraseList[];
  recent: string[];
}

/**
 * The fewest Text fields a wordbank may hold. Lives here rather than with the
 * client's UI because the API boundary has to reject a short list too.
 */
export const MIN_TEXT_FIELDS = 2;

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isStringRecord(x: unknown): x is Record<string, string> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  return Object.values(x).every((v) => typeof v === 'string');
}

function isOverrides(x: unknown): x is Overrides {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  return Object.values(x).every(isStringRecord);
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
  if (!Array.isArray(w.fields) || w.fields.length < MIN_TEXT_FIELDS || !w.fields.every(isTextField))
    return false;
  if (!isOverrides(w.overrides)) return false;
  if (!Array.isArray(w.lists) || w.lists.length === 0 || !w.lists.every(isPhraseList)) return false;
  if (!isStringArray(w.recent)) return false;
  return true;
}

export function defaultWordbank(): Wordbank {
  return {
    fields: defaultTextFields(),
    overrides: {},
    lists: [{ id: crypto.randomUUID(), name: 'List 1', phrases: [] }],
    recent: [],
  };
}

export function defaultTextFields(): TextField[] {
  return Array.from({ length: MIN_TEXT_FIELDS }, () => ({
    id: crypto.randomUUID(),
    defaultValue: '',
  }));
}

/** Raw strings — escaping for the wire happens at the push boundary. */
export function resolveLayerText(
  fields: readonly TextField[],
  overrides: Overrides,
  layer: string,
): string[] {
  return fields.map((field) => overrides[layer]?.[field.id] || field.defaultValue);
}
