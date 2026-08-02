import { For, type JSX } from 'solid-js';
import { fetchEffectCatalog, syncEffectCatalog } from './effects-api';
import type { EffectCatalog } from '@domain/catalog/effect';
import { createCatalogPicker } from './createCatalogPicker';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PickerToolbar } from './PickerToolbar';

export function EffectSelector(): JSX.Element {
  const { loadTox } = usePlayback();
  const picker = createCatalogPicker<EffectCatalog>({
    fetch: fetchEffectCatalog,
    sync: syncEffectCatalog,
    initialValue: [],
    load: loadTox,
  });

  return (
    <section class="flex flex-col gap-1 overflow-y-auto">
      <PickerToolbar
        refreshing={picker.refreshing()}
        error={picker.error()}
        onRefresh={() => void picker.refresh()}
      />

      <div class="flex flex-col content-start gap-1">
        <For
          each={picker.catalog()}
          fallback={<p class="text-sm text-neutral-500">No effects yet.</p>}
        >
          {(effect) => (
            <button
              type="button"
              class="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-left text-neutral-100 hover:border-neutral-500 disabled:opacity-40 disabled:hover:border-neutral-700"
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
