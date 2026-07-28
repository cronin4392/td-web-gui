import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import { TDCallError } from 'td-core';
import { loadSceneOn, type SceneConnections } from '../td';
import type { SceneId } from '../td.config';
import { fetchCatalog, syncCatalog } from '../scenes-api';
import { emptyCatalog, type Scene } from '../scenes';

export function SceneSelector(props: {
  selectedLayer: SceneId;
  connections: SceneConnections;
}): JSX.Element {
  const [catalog, { mutate }] = createResource(fetchCatalog, { initialValue: emptyCatalog() });
  const scenes = () => catalog().scenes;
  const [pickedTag, setPickedTag] = createSignal<string | null>(null);
  const [callError, setCallError] = createSignal<string | undefined>(undefined);
  const [refreshing, setRefreshing] = createSignal(false);

  async function refresh() {
    setCallError(undefined);
    setRefreshing(true);
    try {
      mutate(await syncCatalog());
    } catch (error) {
      setCallError(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRefreshing(false);
    }
  }

  // The catalog is served by the dev/preview server, but the load goes straight
  // to the selected layer's own SceneLoader process — the GUI is not in that path.
  async function loadScene(scene: Scene) {
    setCallError(undefined);
    const connection = props.connections[props.selectedLayer];
    if (!connection) {
      setCallError(`Layer ${props.selectedLayer} has no connected scene process`);
      return;
    }
    try {
      await loadSceneOn(connection, scene.path);
    } catch (error) {
      const reason = error instanceof TDCallError ? error.code : String(error);
      setCallError(`Load failed: ${reason}`);
    }
  }

  const tags = () => catalog().tags;

  /** `null` is the unfiltered "All" option, the default, and the fallback for a
   * tag that vanishes from a refreshed catalog. */
  const selectedTag = createMemo(() => {
    const picked = pickedTag();
    return picked !== null && tags().includes(picked) ? picked : null;
  });

  const tagOptions = createMemo((): (string | null)[] => [null, ...tags()]);

  const visibleScenes = createMemo(() => {
    const tag = selectedTag();
    if (tag === null) return scenes();
    return scenes().filter((scene) => scene.tags.includes(tag));
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
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
            disabled={refreshing()}
            onClick={() => void refresh()}
          >
            {refreshing() ? 'Refreshing…' : 'Refresh'}
          </button>
          <Show when={callError()}>
            {(message) => <p class="truncate text-sm text-red-400">{message()}</p>}
          </Show>
        </div>

        <div class="grid grid-cols-4 content-start gap-1">
          <For
            each={visibleScenes()}
            fallback={<p class="col-span-4 text-sm text-neutral-500">No scenes yet.</p>}
          >
            {(scene) => (
              <button
                type="button"
                class="relative flex aspect-video items-end overflow-hidden rounded border border-neutral-700 bg-neutral-800 bg-cover bg-center text-left hover:border-neutral-500 disabled:opacity-40 disabled:hover:border-neutral-700"
                style={
                  scene.thumbnail ? { 'background-image': `url("${scene.thumbnail}")` } : undefined
                }
                title={scene.name}
                disabled={!scene.path}
                onClick={() => void loadScene(scene)}
              >
                {/* Scrim — the label sits over arbitrary artwork. */}
                <span class="w-full truncate bg-black/60 px-1 py-0.5 text-xs text-neutral-100">
                  {scene.name}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
