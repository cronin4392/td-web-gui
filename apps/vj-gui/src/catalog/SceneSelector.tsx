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
import { emptyCatalog, type Catalog, type Scene } from '@domain/catalog/scene';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import { PanelHeader } from '@/ui/PanelHeader';
import { RadioButton } from '@/ui/RadioButton';
import { createContextMenu, type MenuItems } from '@/ui/ContextMenu';
import { adjustReorderTarget, hasDragMime, moveItem } from '@/ui/dnd';
import styles from './SceneSelector.module.css';

/** Two drag surfaces over one rail, so a tag being reordered and a scene being
 * filed are never mistaken for each other — and a drag from outside the app
 * carries neither. */
const TAG_MIME = 'application/x-td-tag';
const SCENE_MIME = 'application/x-td-scene';

export function SceneSelector(props: { class?: string }): JSX.Element {
  const { loadTox, selectedLevel } = usePlayback();
  const picker = createCatalogPicker<Catalog>({
    fetch: fetchCatalog,
    sync: syncCatalog,
    initialValue: emptyCatalog(),
    load: loadTox,
  });
  const menu = createContextMenu();

  const scenes = () => picker.catalog().scenes;

  const tags = () => picker.catalog().tags;
  const [pickedTag, setPickedTag] = createSignal<string | null>(null);

  /** `null` is the unfiltered "All" option, the default, and the fallback for a
   * tag that vanishes from a refreshed catalog. */
  const selectedTag = createMemo(() => {
    const picked = pickedTag();
    return picked !== null && tags().includes(picked) ? picked : null;
  });

  const visibleScenes = createMemo(() => {
    const tag = selectedTag();
    const showHidden = picker.showHidden();
    return scenes().filter(
      (scene) => (showHidden || !scene.hidden) && (tag === null || scene.tags.includes(tag)),
    );
  });

  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [adding, setAdding] = createSignal(false);
  const [dragTag, setDragTag] = createSignal<string | null>(null);
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

  function sceneMenu(scene: Scene): MenuItems {
    const unfile = scene.tags.map((tag) => ({
      label: `Remove from "${tag}"`,
      onSelect: () => void picker.edit(() => setSceneTag(scene.name, tag, false)),
    }));
    return [
      {
        label: scene.hidden ? 'Show' : 'Hide',
        checked: scene.hidden,
        onSelect: () => void picker.edit(() => setSceneHidden(scene.name, !scene.hidden)),
      },
      ...(unfile.length > 0 ? (['separator'] as const) : []),
      ...unfile,
    ];
  }

  function tagMenu(tag: string): MenuItems {
    const held = carriers(tag);
    return [
      { label: 'Rename', onSelect: () => setRenaming(tag) },
      {
        // Nothing confirms this, so the label carries the cost instead.
        label: held === 0 ? 'Delete' : `Delete (${held} scene${held === 1 ? '' : 's'})`,
        danger: true,
        onSelect: () => void picker.edit(() => deleteTag(tag)),
      },
    ];
  }

  function dropOnTag(event: DragEvent, tag: string): void {
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
    setDragTag(null);
    const all = tags();
    const from = all.indexOf(data.getData(TAG_MIME));
    const onto = all.indexOf(tag);
    if (from < 0 || onto < 0) return;
    const to = adjustReorderTarget(from, onto);
    if (from === to) return;
    void picker.edit(() => setTagOrder(moveItem(all, from, to)));
  }

  return (
    <section class={[styles.selector, props.class].filter(Boolean).join(' ')}>
      <PanelHeader title="Scenes">
        <PickerToolbar
          refreshing={picker.refreshing()}
          showHidden={picker.showHidden()}
          error={picker.error()}
          onRefresh={() => void picker.refresh()}
          onToggleShowHidden={() => picker.toggleShowHidden()}
        />
      </PanelHeader>

      <div class={styles.scenes}>
        {/* Faded while the selected layer is up: loading over a live layer cuts
            in front of the audience, so a tile has to be hovered to be read. */}
        <div class={styles.grid} data-live={selectedLevel() > 0}>
          <For each={visibleScenes()} fallback={<p class={styles.empty}>No scenes yet.</p>}>
            {(scene) => (
              <div
                class={styles.cell}
                data-hidden={scene.hidden}
                data-dark={scene.dark}
                // Filing a scene is the one tag action worth doing mid-set, and
                // Chrome suppresses the click that follows a drag, so the tile
                // stays a load target.
                //
                // `={true}`, never a bare `draggable`: it is an enumerated
                // attribute, not a boolean one, and JSX renders the bare form as
                // `draggable=""` — invalid, so it falls back to not draggable.
                draggable={true}
                onDragStart={(event) => event.dataTransfer?.setData(SCENE_MIME, scene.name)}
                onContextMenu={(event) => menu.open(event, sceneMenu(scene))}
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
              </div>
            )}
          </For>
        </div>
      </div>

      <fieldset
        class={styles.tags}
        aria-label="Scene tag"
        // No native way to scroll a horizontal overflow with a vertical wheel;
        // map it here. Non-passive in Solid, so preventDefault holds.
        onWheel={(event) => {
          if (!event.deltaY) return;
          event.preventDefault();
          event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
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
          {(tag) => (
            <div
              class={styles.tagSlot}
              data-dragging={dragTag() === tag}
              data-dropping={dropTag() === tag}
              // A draggable ancestor stops Chrome placing a caret in a child
              // input, so the slot gives up dragging while it is being renamed.
              draggable={renaming() !== tag}
              onDragStart={(event) => {
                event.dataTransfer?.setData(TAG_MIME, tag);
                setDragTag(tag);
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
              onDrop={(event) => dropOnTag(event, tag)}
              onDragEnd={() => {
                setDragTag(null);
                setDropTag(null);
              }}
              onContextMenu={(event) => menu.open(event, tagMenu(tag))}
            >
              <Show
                when={renaming() === tag}
                fallback={
                  <RadioButton
                    name="scene-tag"
                    checked={selectedTag() === tag}
                    onSelect={() => setPickedTag(tag)}
                  >
                    <span class={styles.tagName} title={tag}>
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
            </div>
          )}
        </For>

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
      </fieldset>

      {menu.element}
    </section>
  );
}
