import { toxPath } from './tox';

export interface Effect {
  name: string;
  hidden: boolean;
  path: string;
}

/** `folder` never reaches the client — `path` is derived from it here, and
 * nothing downstream needs the raw location or the group folder it sat in.
 * `hidden` is optional because a Scan has no way to know it; only a catalog
 * read does. */
export type EffectFields = Omit<Effect, 'path' | 'hidden'> & {
  folder: string;
  hidden?: boolean;
};

export type EffectCatalog = Effect[];

export function effectFrom({ folder, hidden = false, ...fields }: EffectFields): Effect {
  return { ...fields, hidden, path: toxPath(folder, fields.name) };
}

function isEffect(x: unknown): x is Effect {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.name === 'string' && typeof e.hidden === 'boolean' && typeof e.path === 'string';
}

export function isEffectCatalog(x: unknown): x is EffectCatalog {
  return Array.isArray(x) && x.every(isEffect);
}
