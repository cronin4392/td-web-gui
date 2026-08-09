import { For, type JSX } from 'solid-js';
import { fetchEffectCatalog, syncEffectCatalog } from './effects-api';
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
  });

  return (
    <section class={styles.selector}>
      <PickerToolbar
        refreshing={picker.refreshing()}
        error={picker.error()}
        onRefresh={() => void picker.refresh()}
      />

      <div class={styles.list}>
        <For each={picker.catalog()} fallback={<p class={styles.empty}>No effects yet.</p>}>
          {(effect) => (
            <button
              type="button"
              class={styles.effect}
              title={effect.name}
              disabled={!effect.path}
              onClick={() => void picker.loadTox(effect.path)}
            >
              {effect.name}
            </button>
          )}
        </For>
      </div>
    </section>
  );
}
