import { For, Index, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { GuiClient } from '../td';
import { sceneThumbnailUrl } from '../scenes.config';

interface Scene {
  name: string;
  tag: string;
  rank: number;
  thumbnail: string;
}

// Tags with a fixed slot in the strip; the rest sort alphabetically between them.
const TAGS_FIRST = ['blank', 'overlay', 'foreground', 'background'];
const TAGS_LAST = ['random', 'custom'];

/** Blank and non-numeric ranks sort last — `Number('')` is 0, which would sort mid-list. */
function parseRank(cell: string | undefined): number {
  const rank = Number(cell?.trim());
  return cell?.trim() && Number.isFinite(rank) ? rank : -Infinity;
}

function uniqueByName(scenes: Scene[]): Scene[] {
  const seen = new Set<string>();
  return scenes.filter((scene) => {
    if (seen.has(scene.name)) return false;
    seen.add(scene.name);
    return true;
  });
}

export function SceneSelector(): JSX.Element {
  const library = GuiClient.signal('sceneLibrary');
  const [pickedTag, setPickedTag] = createSignal<string | null>(null);

  // Columns by header name, so reordering the DAT's columns can't swap fields.
  const scenes = createMemo((): Scene[] => {
    const value = library.value();
    if (!Array.isArray(value) || value.length === 0) return [];
    const [header, ...body] = value;
    const nameCol = header!.indexOf('name');
    const tagCol = header!.indexOf('tag');
    const rankCol = header!.indexOf('rank');
    const folderCol = header!.indexOf('folder');
    if (nameCol === -1 || tagCol === -1) return [];
    // One row per scene-tag pairing, kept as-is: a scene tagged twice belongs
    // under both tags. Only the All list collapses them.
    return body
      .filter((row) => row[nameCol])
      .map((row) => ({
        name: row[nameCol]!,
        tag: row[tagCol]?.trim() ?? '',
        rank: parseRank(rankCol === -1 ? undefined : row[rankCol]),
        thumbnail: folderCol === -1 ? '' : sceneThumbnailUrl(row[folderCol] ?? ''),
      }))
      .sort((a, b) => b.rank - a.rank);
  });

  const tags = createMemo(() => {
    const present = new Set(
      scenes()
        .map((scene) => scene.tag)
        .filter(Boolean),
    );
    const pinned = new Set([...TAGS_FIRST, ...TAGS_LAST]);
    return [
      ...TAGS_FIRST.filter((tag) => present.has(tag)),
      ...[...present].filter((tag) => !pinned.has(tag)).sort(),
      ...TAGS_LAST.filter((tag) => present.has(tag)),
    ];
  });

  /** `null` is the unfiltered "All" option, the default, and the fallback for a
   * tag that vanishes from a refreshed library. */
  const selectedTag = createMemo(() => {
    const picked = pickedTag();
    return picked !== null && tags().includes(picked) ? picked : null;
  });

  const tagOptions = createMemo((): (string | null)[] => [null, ...tags()]);

  const visibleScenes = createMemo(() => {
    const tag = selectedTag();
    if (tag === null) return uniqueByName(scenes());
    return scenes().filter((scene) => scene.tag === tag);
  });

  return (
    <section class="flex min-h-0 gap-3">
      <Show when={tags().length > 0}>
        <fieldset class="flex shrink-0 flex-col gap-1 overflow-y-auto">
          <legend class="sr-only">Scene tag</legend>
          {/* For, not Index: a radio holds DOM state, so a reordered list must
              move the node rather than rewrite its label. */}
          <For each={tagOptions()}>
            {(tag) => (
              <label class="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="radio"
                  name="scene-tag"
                  value={tag ?? ''}
                  checked={selectedTag() === tag}
                  onChange={() => setPickedTag(tag)}
                />
                {tag ?? 'All'}
              </label>
            )}
          </For>
        </fieldset>
      </Show>

      <div class="grid min-w-0 flex-1 grid-cols-4 content-start gap-1 overflow-y-auto">
        {/* Index, not For: the memo mints fresh objects on every library
            snapshot, so referential keying would rebuild the whole grid. */}
        <Index
          each={visibleScenes()}
          fallback={<p class="col-span-4 text-sm text-neutral-500">No scenes yet.</p>}
        >
          {(scene) => (
            <button
              type="button"
              class="relative flex aspect-video items-end overflow-hidden rounded border border-neutral-700 bg-neutral-800 bg-cover bg-center text-left hover:border-neutral-500"
              style={
                scene().thumbnail
                  ? { 'background-image': `url("${scene().thumbnail}")` }
                  : undefined
              }
              title={scene().name}
            >
              {/* Scrim — the label sits over arbitrary artwork. */}
              <span class="w-full truncate bg-black/60 px-1 py-0.5 text-xs text-neutral-100">
                {scene().name}
              </span>
            </button>
          )}
        </Index>
      </div>
    </section>
  );
}
