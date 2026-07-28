import { createSignal, onCleanup, type JSX } from 'solid-js';
import { defaultLayer, guiInstance, sceneInstances, type SceneId } from './td.config';
import { GuiProvider, type SceneConnections } from './td';
import { createVjGuiStore } from './store';
import { saveLibrary } from './library-api';
import type { Library } from './library';
import { EffectSelector } from './components/SceneEffectSelectors/EffectSelector';
import { LayerPreviews } from './components/LayerPreviews';
import { SceneSelector } from './components/SceneEffectSelectors/SceneSelector';
import { TextSelector } from './components/TextSelector/TextSelector';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchLibrary()`). */
  library: Library;
}

export function App(props: AppProps): JSX.Element {
  const store = createVjGuiStore({ initial: props.library, persistence: { save: saveLibrary } });
  onCleanup(() => store.dispose());

  const [selectedLayer, setSelectedLayer] = createSignal<SceneId>(defaultLayer);
  const [sceneConnections, setSceneConnections] = createSignal<SceneConnections>({});

  return (
    <main class="grid grid-rows-[1_2] h-screen gap-6 px-2 pt-2">
      {/* Eight columns for the eight loaders this grows into; two are live. */}
      <LayerPreviews
        selected={selectedLayer()}
        onSelect={setSelectedLayer}
        onConnection={(layer, connection) =>
          setSceneConnections((prev) => ({ ...prev, [layer]: connection }))
        }
      />
      {/* The GUI project is a separate process from the scenes, so its params
          live behind their own provider — the text selector is the only thing
          bound to it. */}
      <GuiProvider>
        <div class="grid grid-cols-3 gap-4">
          <SceneSelector selectedLayer={selectedLayer()} connections={sceneConnections()} />
          <EffectSelector selectedLayer={selectedLayer()} connections={sceneConnections()} />
          <TextSelector store={store} selectedLayer={selectedLayer()} />
        </div>
      </GuiProvider>
      {/* Hidden for now — re-enable by dropping the `hidden` class. */}
      <p class="mt-6 hidden shrink-0 text-sm text-neutral-500">
        Bound to{' '}
        {[guiInstance, ...sceneInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
      </p>
    </main>
  );
}
