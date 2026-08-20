import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { fetchCatalog, setSceneHidden, syncCatalog } from './scenes-api';
import { emptyCatalog, type Catalog } from '@domain/catalog/scene';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import { RadioButton } from '@/ui/RadioButton';
import styles from './SceneSelector.module.css';

export function SceneSelector(props: { class?: string }): JSX.Element {
  const { loadTox, selectedLevel } = usePlayback();
  const picker = createCatalogPicker<Catalog>({
    fetch: fetchCatalog,
    sync: syncCatalog,
    initialValue: emptyCatalog(),
    load: loadTox,
    setHidden: setSceneHidden,
  });

  const scenes = () => picker.catalog().scenes;

  /** Editing is the one view that shows a tag whose every scene is hidden —
   * otherwise there would be no way to unhide them. */
  const tags = createMemo(() => {
    const all = picker.catalog().tags;
    if (picker.editing()) return all;
    const inUse = new Set(scenes().flatMap((scene) => (scene.hidden ? [] : scene.tags)));
    return all.filter((tag) => inUse.has(tag));
  });
  const [pickedTag, setPickedTag] = createSignal<string | null>(null);

  /** `null` is the unfiltered "All" option, the default, and the fallback for a
   * tag that vanishes from a refreshed catalog. */
  const selectedTag = createMemo(() => {
    const picked = pickedTag();
    return picked !== null && tags().includes(picked) ? picked : null;
  });

  const tagOptions = createMemo((): (string | null)[] => [null, ...tags()]);

  const visibleScenes = createMemo(() => {
    const tag = selectedTag();
    const editing = picker.editing();
    return scenes().filter(
      (scene) => (editing || !scene.hidden) && (tag === null || scene.tags.includes(tag)),
    );
  });

  return (
    <section class={[styles.selector, props.class].filter(Boolean).join(' ')}>
      <Show when={tags().length > 0}>
        <fieldset class={styles.tags} aria-label="Scene tag">
          {/* For, not Index: a radio holds DOM state, so a reordered list must
              move the node rather than rewrite its label. */}
          <For each={tagOptions()}>
            {(tag) => (
              <RadioButton
                name="scene-tag"
                checked={selectedTag() === tag}
                onSelect={() => setPickedTag(tag)}
              >
                {tag ?? 'All'}
              </RadioButton>
            )}
          </For>
        </fieldset>
      </Show>

      <div class={styles.scenes}>
        <PickerToolbar
          refreshing={picker.refreshing()}
          editing={picker.editing()}
          error={picker.error()}
          onRefresh={() => void picker.refresh()}
          onToggleEditing={() => picker.toggleEditing()}
        />

        {/* Faded while the selected layer is up: loading over a live layer cuts
            in front of the audience, so a tile has to be hovered to be read. */}
        <div class={styles.grid} data-live={selectedLevel() > 0}>
          <For each={visibleScenes()} fallback={<p class={styles.empty}>No scenes yet.</p>}>
            {(scene) => (
              // The hide button can't nest inside the tile — a button inside a
              // button is invalid, and the tile is the load target.
              <div class={styles.cell} data-hidden={scene.hidden}>
                <button
                  type="button"
                  class={styles.tile}
                  style={
                    scene.thumbnail
                      ? { 'background-image': `url("${scene.thumbnail}")` }
                      : undefined
                  }
                  title={scene.name}
                  disabled={!scene.path}
                  onClick={() => void picker.loadTox(scene.path)}
                >
                  {/* Scrim — the label sits over arbitrary artwork. */}
                  <span class={styles.caption}>{scene.name}</span>
                </button>

                <Show when={picker.editing()}>
                  <button
                    type="button"
                    class={styles.hide}
                    onClick={() => void picker.setHidden(scene.name, !scene.hidden)}
                  >
                    {scene.hidden ? 'Show' : 'Hide'}
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
