export const SCENES_ROUTE = '/scenes';

export const SCENE_THUMBNAIL = 'thumbnail.jpg';

/** Read by the dev/preview server only — the browser goes through SCENES_ROUTE. */
export function scenesRoot(env: Record<string, string | undefined>): string {
  return (
    env.VJ_SCENES_ROOT ?? 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Scenes-35280'
  );
}

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
