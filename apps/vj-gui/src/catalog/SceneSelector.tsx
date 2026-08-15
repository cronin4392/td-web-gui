import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { fetchCatalog, syncCatalog } from './scenes-api';
import { emptyCatalog, type Catalog } from '@domain/catalog/scene';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import { RadioButton } from '@/ui/RadioButton';
import styles from './SceneSelector.module.css';

export function SceneSelector(): JSX.Element {
  const { loadTox, selectedLevel } = usePlayback();
  const picker = createCatalogPicker<Catalog>({
    fetch: fetchCatalog,
    sync: syncCatalog,
    initialValue: emptyCatalog(),
    load: loadTox,
  });

  const scenes = () => picker.catalog().scenes;
  const tags = () => picker.catalog().tags;
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
    if (tag === null) return scenes();
    return scenes().filter((scene) => scene.tags.includes(tag));
  });

  return (
    <section class={styles.selector}>
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
          error={picker.error()}
          onRefresh={() => void picker.refresh()}
        />

        {/* Faded while the selected layer is up: loading over a live layer cuts
            in front of the audience, so a tile has to be hovered to be read. */}
        <div class={styles.grid} data-live={selectedLevel() > 0}>
          <For each={visibleScenes()} fallback={<p class={styles.empty}>No scenes yet.</p>}>
            {(scene) => (
              <button
                type="button"
                class={styles.tile}
                style={
                  scene.thumbnail ? { 'background-image': `url("${scene.thumbnail}")` } : undefined
                }
                title={scene.name}
                disabled={!scene.path}
                onClick={() => void picker.loadTox(scene.path)}
              >
                {/* Scrim — the label sits over arbitrary artwork. */}
                <span class={styles.caption}>{scene.name}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
