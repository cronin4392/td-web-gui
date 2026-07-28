import { For, Index, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { TDCallError } from 'td-core';
import { GuiClient, loadSceneOn, type SceneConnections } from '../td';
import type { SceneId } from '../td.config';
import { parseSceneLibrary, uniqueByName, type Scene } from '../scene-library';

// Tags with a fixed slot in the strip; the rest sort alphabetically between them.
const TAGS_FIRST = ['blank', 'overlay', 'foreground', 'background'];
const TAGS_LAST = ['random', 'custom'];

export function SceneSelector(props: {
  selectedLayer: SceneId;
  connections: SceneConnections;
}): JSX.Element {
  const library = GuiClient.signal('sceneLibrary');
  const [pickedTag, setPickedTag] = createSignal<string | null>(null);
  const [callError, setCallError] = createSignal<string | undefined>(undefined);

  const scenes = createMemo((): Scene[] => parseSceneLibrary(library.value()));

  // The library is read from the GUI project, but the load goes straight to the
  // selected layer's own SceneLoader process — the GUI is not in that path.
  async function loadScene(scene: Scene) {
    setCallError(undefined);
    const connection = props.connections[props.selectedLayer];
    if (!connection) {
      setCallError(`layer ${props.selectedLayer} has no connected scene process`);
      return;
    }
    try {
      await loadSceneOn(connection, scene.path);
    } catch (error) {
      setCallError(error instanceof TDCallError ? error.code : String(error));
    }
  }

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

      <div class="flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto">
        <Show when={callError()}>
          {(code) => <p class="shrink-0 text-sm text-red-400">Load failed: {code()}</p>}
        </Show>

        <div class="grid grid-cols-4 content-start gap-1">
          {/* Index, not For: the memo mints fresh objects on every library
              snapshot, so referential keying would rebuild the whole grid. */}
          <Index
            each={visibleScenes()}
            fallback={<p class="col-span-4 text-sm text-neutral-500">No scenes yet.</p>}
          >
            {(scene) => (
              <button
                type="button"
                class="relative flex aspect-video items-end overflow-hidden rounded border border-neutral-700 bg-neutral-800 bg-cover bg-center text-left hover:border-neutral-500 disabled:opacity-40 disabled:hover:border-neutral-700"
                style={
                  scene().thumbnail
                    ? { 'background-image': `url("${scene().thumbnail}")` }
                    : undefined
                }
                title={scene().name}
                disabled={!scene().path}
                onClick={() => void loadScene(scene())}
              >
                {/* Scrim — the label sits over arbitrary artwork. */}
                <span class="w-full truncate bg-black/60 px-1 py-0.5 text-xs text-neutral-100">
                  {scene().name}
                </span>
              </button>
            )}
          </Index>
        </div>
      </div>
    </section>
  );
}
