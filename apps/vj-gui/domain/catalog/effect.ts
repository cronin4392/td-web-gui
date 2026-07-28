import { toxPath } from './tox';

export interface Effect {
  name: string;
  path: string;
}

/** `folder` never reaches the client — `path` is derived from it here, and
 * nothing downstream needs the raw location or the group folder it sat in. */
export type EffectFields = Omit<Effect, 'path'> & { folder: string };

export type EffectCatalog = Effect[];

export function effectFrom({ folder, ...fields }: EffectFields): Effect {
  return { ...fields, path: toxPath(folder, fields.name) };
}

function isEffect(x: unknown): x is Effect {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.name === 'string' && typeof e.path === 'string';
}

export function isEffectCatalog(x: unknown): x is EffectCatalog {
  return Array.isArray(x) && x.every(isEffect);
}
