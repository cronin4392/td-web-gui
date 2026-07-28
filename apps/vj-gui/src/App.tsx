import { createSignal, onCleanup, type JSX } from 'solid-js';
import { defaultLayer, guiInstance, type LayerId } from './playback/layers';
import { loaderInstances } from './playback/wire';
import { GuiProvider, type LayerConnections } from './playback/clients';
import { createWordbankStore } from './wordbank/store';
import { saveWordbank } from './wordbank/wordbank-api';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { EffectSelector } from './catalog/EffectSelector';
import { LayerPreviews } from './playback/LayerPreviews';
import { SceneSelector } from './catalog/SceneSelector';
import { TextSelector } from './wordbank/TextSelector';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchWordbank()`). */
  wordbank: Wordbank;
}

export function App(props: AppProps): JSX.Element {
  const store = createWordbankStore({
    initial: props.wordbank,
    persistence: { save: saveWordbank },
  });
  onCleanup(() => store.dispose());

  const [selectedLayer, setSelectedLayer] = createSignal<LayerId>(defaultLayer);
  const [layerConnections, setLayerConnections] = createSignal<LayerConnections>({});

  return (
    <main class="grid grid-rows-[1_2] h-screen gap-6 px-2 pt-2">
      {/* Eight columns for the eight loaders this grows into; two are live. */}
      <LayerPreviews
        selected={selectedLayer()}
        onSelect={setSelectedLayer}
        onConnection={(layer, connection) =>
          setLayerConnections((prev) => ({ ...prev, [layer]: connection }))
        }
      />
      {/* The GUI project is a separate process from the scenes, so its params
          live behind their own provider — the text selector is the only thing
          bound to it. */}
      <GuiProvider>
        <div class="grid grid-cols-3 gap-4">
          <SceneSelector selectedLayer={selectedLayer()} connections={layerConnections()} />
          <EffectSelector selectedLayer={selectedLayer()} connections={layerConnections()} />
          <TextSelector store={store} selectedLayer={selectedLayer()} />
        </div>
      </GuiProvider>
      {/* Hidden for now — re-enable by dropping the `hidden` class. */}
      <p class="mt-6 hidden shrink-0 text-sm text-neutral-500">
        Bound to{' '}
        {[guiInstance, ...loaderInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
      </p>
    </main>
  );
}
