export const SCENES_ROUTE = '/scenes';

export const SCENE_THUMBNAIL = 'thumbnail.jpg';

export function sceneFolderName(folder: string): string {
  const segments = folder.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

/** `folder` is the absolute TD path from `sceneLibrary`; only its last segment
 * survives into the URL. */
export function sceneThumbnailUrl(folder: string): string {
  const name = sceneFolderName(folder);
  return name ? `${SCENES_ROUTE}/${encodeURIComponent(name)}/${SCENE_THUMBNAIL}` : '';
}

export const THUMBNAIL_FROM = 'from';

/** The same URL plus the folder it was derived from, so the server can refuse a
 * folder that isn't the library one — TD can load a `.tox` from anywhere, and
 * only the last segment reaches the URL, so two folders can collide. Callers
 * that already hold an absolute path from TD use this; the catalog does not,
 * because `folder` deliberately never reaches the browser. */
export function sceneThumbnailUrlFrom(folder: string): string {
  const url = sceneThumbnailUrl(folder);
  return url ? `${url}?${THUMBNAIL_FROM}=${encodeURIComponent(folder)}` : '';
}
