import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import {
  fetchEffectCatalog,
  setEffectFavorite,
  setEffectHidden,
  syncEffectCatalog,
} from './effects-api';
import type { Effect, EffectCatalog } from '@domain/catalog/effect';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import { PanelHeader } from '@/ui/PanelHeader';
import styles from './EffectSelector.module.css';

export function EffectSelector(): JSX.Element {
  const { loadTox } = usePlayback();
  const picker = createCatalogPicker<EffectCatalog>({
    fetch: fetchEffectCatalog,
    sync: syncEffectCatalog,
    initialValue: [],
    load: loadTox,
  });

  const [search, setSearch] = createSignal('');
  const query = createMemo(() => search().trim().toLowerCase());

  const visibleEffects = createMemo(() => {
    const needle = query();
    const editing = picker.editing();
    return picker
      .catalog()
      .filter(
        (effect) => (editing || !effect.hidden) && effect.name.toLowerCase().includes(needle),
      );
  });

  /** Favorites are a second view of the same effects, not a slice taken out of
   * the list — an effect stays where the muscle memory left it. The search
   * never touches them: they are the shortcut you reach for instead of typing. */
  const favorites = createMemo(() =>
    picker.catalog().filter((effect) => effect.favorite && (picker.editing() || !effect.hidden)),
  );

  function row(effect: Effect): JSX.Element {
    return (
      <div class={styles.row} data-hidden={effect.hidden}>
        <button
          type="button"
          class={styles.effect}
          title={effect.name}
          disabled={!effect.path}
          onClick={() => {
            setSearch('');
            void picker.loadTox(effect.path);
          }}
        >
          {effect.name}
        </button>

        <Show when={picker.editing()}>
          <button
            type="button"
            class={styles.favorite}
            aria-pressed={effect.favorite}
            title={effect.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => void picker.edit(() => setEffectFavorite(effect.name, !effect.favorite))}
          >
            {effect.favorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            class={styles.hide}
            onClick={() => void picker.edit(() => setEffectHidden(effect.name, !effect.hidden))}
          >
            {effect.hidden ? 'Show' : 'Hide'}
          </button>
        </Show>
      </div>
    );
  }

  return (
    <section class={styles.selector}>
      <PanelHeader title="Effects">
        <PickerToolbar
          refreshing={picker.refreshing()}
          editing={picker.editing()}
          error={picker.error()}
          onRefresh={() => void picker.refresh()}
          onToggleEditing={() => picker.toggleEditing()}
        />
      </PanelHeader>

      <Show when={favorites().length > 0}>
        <div class={`${styles.list} ${styles.favorites}`}>
          <For each={favorites()}>{row}</For>
        </div>
      </Show>

      <input
        type="search"
        class={styles.search}
        placeholder="Search"
        aria-label="Search effects"
        value={search()}
        onInput={(event) => setSearch(event.currentTarget.value)}
      />

      <div class={styles.list}>
        <For
          each={visibleEffects()}
          fallback={<p class={styles.empty}>{query() ? 'No effects match.' : 'No effects yet.'}</p>}
        >
          {row}
        </For>
      </div>
    </section>
  );
}
