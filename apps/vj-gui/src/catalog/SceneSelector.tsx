import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import {
  createTag,
  deleteTag,
  fetchCatalog,
  renameTag,
  setSceneHidden,
  setSceneTag,
  setTagOrder,
  syncCatalog,
} from './scenes-api';
import { emptyCatalog, type Catalog } from '@domain/catalog/scene';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import { PanelHeader } from '@/ui/PanelHeader';
import { RadioButton } from '@/ui/RadioButton';
import { adjustReorderTarget, hasDragMime, moveItem } from '@/ui/dnd';
import styles from './SceneSelector.module.css';

/** Two drag surfaces over one rail, so a tag being reordered and a scene being
 * filed are never mistaken for each other — and a drag from outside the app
 * carries neither. */
const TAG_MIME = 'application/x-td-tag-index';
const SCENE_MIME = 'application/x-td-scene';

export function SceneSelector(props: { class?: string }): JSX.Element {
  const { loadTox, selectedLevel } = usePlayback();
  const picker = createCatalogPicker<Catalog>({
    fetch: fetchCatalog,
    sync: syncCatalog,
    initialValue: emptyCatalog(),
    load: loadTox,
  });

  const scenes = () => picker.catalog().scenes;

  /** Editing is the one view that shows a tag whose every scene is hidden —
   * otherwise there would be no way to unhide them. It is also the only view
   * whose list is the whole catalog, which is what lets a reorder send it. */
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

  const visibleScenes = createMemo(() => {
    const tag = selectedTag();
    const editing = picker.editing();
    return scenes().filter(
      (scene) => (editing || !scene.hidden) && (tag === null || scene.tags.includes(tag)),
    );
  });

  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [confirming, setConfirming] = createSignal<string | null>(null);
  const [adding, setAdding] = createSignal(false);
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const [dropTag, setDropTag] = createSignal<string | null>(null);

  const carriers = (tag: string) => scenes().filter((scene) => scene.tags.includes(tag)).length;

  // Enter submits the form and Escape blurs it, so both handlers fire for one
  // edit; whichever lands first closes the input and the other returns here.
  function commitCreate(value: string): void {
    if (!adding()) return;
    setAdding(false);
    const name = value.trim();
    if (name) void picker.edit(() => createTag(name));
  }

  function commitRename(tag: string, value: string): void {
    if (renaming() !== tag) return;
    setRenaming(null);
    const name = value.trim();
    if (!name || name === tag) return;
    void picker.edit(async () => {
      const catalog = await renameTag(tag, name);
      // The rail keys a slot by its name, so the old one is gone. Follow the
      // rename, or `selectedTag` quietly falls back to All mid-edit.
      if (pickedTag() === tag) setPickedTag(name);
      return catalog;
    });
  }

  function removeTag(tag: string): void {
    setConfirming(null);
    void picker.edit(() => deleteTag(tag));
  }

  function dropOnTag(event: DragEvent, tag: string, index: number): void {
    const data = event.dataTransfer;
    if (!data) return;

    if (hasDragMime(data, SCENE_MIME)) {
      event.preventDefault();
      setDropTag(null);
      const scene = data.getData(SCENE_MIME);
      if (scene) void picker.edit(() => setSceneTag(scene, tag, true));
      return;
    }

    if (!hasDragMime(data, TAG_MIME)) return;
    event.preventDefault();
    const from = dragIndex();
    setDragIndex(null);
    if (from === null) return;
    const to = adjustReorderTarget(from, index);
    if (from === to) return;
    // Reordering is edit-only, so `tags()` is the whole catalog here — which is
    // what the server requires, since a partial list is not a permutation.
    void picker.edit(() => setTagOrder(moveItem(tags(), from, to)));
  }

  return (
    <section class={[styles.selector, props.class].filter(Boolean).join(' ')}>
      <PanelHeader title="Scenes" class={styles.panelHeader}>
        <PickerToolbar
          refreshing={picker.refreshing()}
          editing={picker.editing()}
          error={picker.error()}
          onRefresh={() => void picker.refresh()}
          onToggleEditing={() => picker.toggleEditing()}
        />
      </PanelHeader>

      {/* Editing keeps the rail even with no tags left — the `+` lives in it, so
          deleting the last tag would otherwise remove the way to make another. */}
      <Show when={picker.editing() || tags().length > 0}>
        <fieldset class={styles.tags} aria-label="Scene tag" data-editing={picker.editing()}>
          <RadioButton
            name="scene-tag"
            checked={selectedTag() === null}
            onSelect={() => setPickedTag(null)}
          >
            All
          </RadioButton>

          {/* For, not Index: a radio holds DOM state, so a reordered list must
              move the node rather than rewrite its label. */}
          <For each={tags()}>
            {(tag, i) => (
              <div
                class={styles.tagSlot}
                data-dragging={dragIndex() === i()}
                data-dropping={dropTag() === tag}
                // A draggable ancestor stops Chrome placing a caret in a child
                // input, so the slot gives up dragging while it is being renamed.
                draggable={picker.editing() && renaming() !== tag}
                onDragStart={(event) => {
                  event.dataTransfer?.setData(TAG_MIME, String(i()));
                  setDragIndex(i());
                }}
                onDragOver={(event) => {
                  const data = event.dataTransfer;
                  if (!data) return;
                  const scene = hasDragMime(data, SCENE_MIME);
                  if (!scene && !hasDragMime(data, TAG_MIME)) return;
                  event.preventDefault();
                  if (scene) setDropTag(tag);
                }}
                onDragLeave={() => setDropTag(null)}
                onDrop={(event) => dropOnTag(event, tag, i())}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropTag(null);
                }}
              >
                <Show
                  when={renaming() === tag}
                  fallback={
                    <RadioButton
                      name="scene-tag"
                      checked={selectedTag() === tag}
                      onSelect={() => setPickedTag(tag)}
                    >
                      <span
                        class={styles.tagName}
                        title={tag}
                        onDblClick={() => picker.editing() && setRenaming(tag)}
                      >
                        {tag}
                      </span>
                    </RadioButton>
                  }
                >
                  <form
                    class={styles.tagForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(
                        tag,
                        (event.currentTarget.elements.namedItem('tag') as HTMLInputElement).value,
                      );
                    }}
                  >
                    <input
                      name="tag"
                      class={styles.tagInput}
                      value={tag}
                      ref={(el) => {
                        queueMicrotask(() => {
                          el.focus();
                          el.select();
                        });
                      }}
                      onBlur={(event) => commitRename(tag, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                    />
                  </form>
                </Show>

                <Show when={picker.editing() && renaming() !== tag}>
                  <Show
                    when={confirming() === tag}
                    fallback={
                      <button
                        type="button"
                        tabIndex={-1}
                        class={styles.tagDelete}
                        aria-label={`Delete tag "${tag}"`}
                        // A tag no scene carries is nothing to lose; one that is
                        // in use takes its filing with it, so it asks first.
                        onClick={() => (carriers(tag) === 0 ? removeTag(tag) : setConfirming(tag))}
                      >
                        ×
                      </button>
                    }
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      class={styles.tagConfirm}
                      aria-label={`Delete tag "${tag}", removing it from ${carriers(tag)} scenes`}
                      title={`Remove from ${carriers(tag)} scenes`}
                      onClick={() => removeTag(tag)}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      class={styles.tagDelete}
                      aria-label="Keep the tag"
                      onClick={() => setConfirming(null)}
                    >
                      ✕
                    </button>
                  </Show>
                </Show>
              </div>
            )}
          </For>

          <Show when={picker.editing()}>
            <Show
              when={adding()}
              fallback={
                <button
                  type="button"
                  class={styles.tagAdd}
                  aria-label="Add a tag"
                  onClick={() => setAdding(true)}
                >
                  +
                </button>
              }
            >
              <form
                class={styles.tagForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  commitCreate(
                    (event.currentTarget.elements.namedItem('tag') as HTMLInputElement).value,
                  );
                }}
              >
                <input
                  name="tag"
                  class={styles.tagInput}
                  placeholder="New tag"
                  ref={(el) => queueMicrotask(() => el.focus())}
                  onBlur={(event) => commitCreate(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setAdding(false);
                  }}
                />
              </form>
            </Show>
          </Show>
        </fieldset>
      </Show>

      <div class={styles.scenes}>
        {/* Faded while the selected layer is up: loading over a live layer cuts
            in front of the audience, so a tile has to be hovered to be read. */}
        <div class={styles.grid} data-live={selectedLevel() > 0}>
          <For each={visibleScenes()} fallback={<p class={styles.empty}>No scenes yet.</p>}>
            {(scene) => (
              // The buttons can't nest inside the tile — a button inside a
              // button is invalid, and the tile is the load target.
              <div
                class={styles.cell}
                data-hidden={scene.hidden}
                draggable={picker.editing()}
                onDragStart={(event) => event.dataTransfer?.setData(SCENE_MIME, scene.name)}
              >
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
                  <div class={styles.cellActions}>
                    <button
                      type="button"
                      class={styles.action}
                      onClick={() =>
                        void picker.edit(() => setSceneHidden(scene.name, !scene.hidden))
                      }
                    >
                      {scene.hidden ? 'Show' : 'Hide'}
                    </button>

                    {/* Only inside a tag tab: "remove from this tag" has no
                        meaning in All, where no one tag is in view. */}
                    <Show when={selectedTag()}>
                      {(tag) => (
                        <button
                          type="button"
                          class={styles.action}
                          aria-label={`Remove "${scene.name}" from "${tag()}"`}
                          title={`Remove from "${tag()}"`}
                          onClick={() =>
                            void picker.edit(() => setSceneTag(scene.name, tag(), false))
                          }
                        >
                          ×
                        </button>
                      )}
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
