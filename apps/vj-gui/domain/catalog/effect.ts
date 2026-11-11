import { toxPath } from './tox';

export interface Effect {
  name: string;
  hidden: boolean;
  favorite: boolean;
  path: string;
}

/** `folder` never reaches the client — `path` is derived from it here, and
 * nothing downstream needs the raw location or the group folder it sat in.
 * `hidden` and `favorite` are optional because a Scan has no way to know them;
 * only a catalog read does. */
export type EffectFields = Omit<Effect, 'path' | 'hidden' | 'favorite'> & {
  folder: string;
  hidden?: boolean;
  favorite?: boolean;
};

export type EffectCatalog = Effect[];

export function effectFrom({
  folder,
  hidden = false,
  favorite = false,
  ...fields
}: EffectFields): Effect {
  return { ...fields, hidden, favorite, path: toxPath(folder, fields.name) };
}

function isEffect(x: unknown): x is Effect {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    typeof e.hidden === 'boolean' &&
    typeof e.favorite === 'boolean' &&
    typeof e.path === 'string'
  );
}

export function isEffectCatalog(x: unknown): x is EffectCatalog {
  return Array.isArray(x) && x.every(isEffect);
}
