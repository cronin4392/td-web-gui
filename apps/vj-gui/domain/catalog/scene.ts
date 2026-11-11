import { sceneThumbnailUrl } from './thumbnail';
import { toxPath } from './tox';

export interface Scene {
  name: string;
  tags: string[];
  /** `null` when `meta.json` omits it or gives a non-number; sorts last. */
  rank: number | null;
  /** Carried end-to-end but not rendered yet — the picker will style dark
   * scenes differently. Deliberate, not dead weight. */
  dark: boolean;
  hidden: boolean;
  path: string;
  thumbnail: string;
}

/** `folder` never reaches the client — `path` and `thumbnail` are derived from
 * it here, and nothing downstream needs the raw location. `hidden` and `tags`
 * are optional because a Scan has no way to know them: both are authored in the
 * GUI, so only a catalog read carries them. */
export type SceneFields = Omit<Scene, 'path' | 'thumbnail' | 'hidden' | 'tags'> & {
  folder: string;
  hidden?: boolean;
  tags?: string[];
};

/** `tags` is every known tag, already in picker order — the ordering lives in
 * the `tags` table's rank, so the client renders the list as given. */
export interface Catalog {
  scenes: Scene[];
  tags: string[];
}

/** The one place `path` and `thumbnail` are derived, so a scan and a DB read
 * can't disagree about them. */
export function sceneFrom({ folder, hidden = false, tags = [], ...fields }: SceneFields): Scene {
  return {
    ...fields,
    tags,
    hidden,
    path: toxPath(folder, fields.name),
    thumbnail: sceneThumbnailUrl(folder),
  };
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isScene(x: unknown): x is Scene {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.name === 'string' &&
    isStringArray(s.tags) &&
    (s.rank === null || typeof s.rank === 'number') &&
    typeof s.dark === 'boolean' &&
    typeof s.hidden === 'boolean' &&
    typeof s.path === 'string' &&
    typeof s.thumbnail === 'string'
  );
}

export function isCatalog(x: unknown): x is Catalog {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Record<string, unknown>;
  return Array.isArray(c.scenes) && c.scenes.every(isScene) && isStringArray(c.tags);
}

export function emptyCatalog(): Catalog {
  return { scenes: [], tags: [] };
}
