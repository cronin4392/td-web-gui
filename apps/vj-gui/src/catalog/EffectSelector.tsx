import { For, Show, createMemo, type JSX } from 'solid-js';
import { fetchEffectCatalog, setEffectHidden, syncEffectCatalog } from './effects-api';
import type { EffectCatalog } from '@domain/catalog/effect';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';
import styles from './EffectSelector.module.css';

export function EffectSelector(): JSX.Element {
  const { loadTox } = usePlayback();
  const picker = createCatalogPicker<EffectCatalog>({
    fetch: fetchEffectCatalog,
    sync: syncEffectCatalog,
    initialValue: [],
    load: loadTox,
    setHidden: setEffectHidden,
  });

  const visibleEffects = createMemo(() =>
    picker.editing() ? picker.catalog() : picker.catalog().filter((effect) => !effect.hidden),
  );

  return (
    <section class={styles.selector}>
      <PickerToolbar
        refreshing={picker.refreshing()}
        editing={picker.editing()}
        error={picker.error()}
        onRefresh={() => void picker.refresh()}
        onToggleEditing={() => picker.toggleEditing()}
      />

      <div class={styles.list}>
        <For each={visibleEffects()} fallback={<p class={styles.empty}>No effects yet.</p>}>
          {(effect) => (
            <div class={styles.row} data-hidden={effect.hidden}>
              <button
                type="button"
                class={styles.effect}
                title={effect.name}
                disabled={!effect.path}
                onClick={() => void picker.loadTox(effect.path)}
              >
                {effect.name}
              </button>

              <Show when={picker.editing()}>
                <button
                  type="button"
                  class={styles.hide}
                  onClick={() => void picker.setHidden(effect.name, !effect.hidden)}
                >
                  {effect.hidden ? 'Show' : 'Hide'}
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
