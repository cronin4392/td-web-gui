import { sceneThumbnailUrl, sceneToxPath } from './scenes.config';

export interface Scene {
  name: string;
  tag: string;
  rank: number;
  path: string;
  thumbnail: string;
}

/** Blank and non-numeric ranks sort last — `Number('')` is 0, which would sort mid-list. */
function parseRank(cell: string | undefined): number {
  const rank = Number(cell?.trim());
  return cell?.trim() && Number.isFinite(rank) ? rank : -Infinity;
}

export function parseSceneLibrary(value: string[][] | undefined): Scene[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const [header, ...body] = value;
  // Columns by header name, so reordering the DAT's columns can't swap fields.
  const nameCol = header!.indexOf('name');
  const tagCol = header!.indexOf('tag');
  const rankCol = header!.indexOf('rank');
  const folderCol = header!.indexOf('folder');
  if (nameCol === -1 || tagCol === -1) return [];
  // One row per scene-tag pairing, kept as-is: a scene tagged twice belongs
  // under both tags. Only uniqueByName collapses them.
  return body
    .filter((row) => row[nameCol])
    .map((row) => {
      const name = row[nameCol]!;
      const folder = folderCol === -1 ? '' : (row[folderCol] ?? '');
      return {
        name,
        tag: row[tagCol]?.trim() ?? '',
        rank: parseRank(rankCol === -1 ? undefined : row[rankCol]),
        path: sceneToxPath(folder, name),
        thumbnail: sceneThumbnailUrl(folder),
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

export function uniqueByName(scenes: Scene[]): Scene[] {
  const seen = new Set<string>();
  return scenes.filter((scene) => {
    if (seen.has(scene.name)) return false;
    seen.add(scene.name);
    return true;
  });
}
