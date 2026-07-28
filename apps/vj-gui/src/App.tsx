import { createSignal, onCleanup, type JSX } from 'solid-js';
import { guiInstance, sceneInstances, type SceneId } from './td.config';
import { GuiProvider } from './td';
import { createVjGuiStore } from './store';
import { saveLibrary } from './library-api';
import type { Library } from './library';
import { LayerPreviews } from './components/LayerPreviews';
import { SceneSelector } from './components/SceneSelector';
import { TextSelector } from './components/TextSelector';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchLibrary()`). */
  library: Library;
}

export function App(props: AppProps): JSX.Element {
  const store = createVjGuiStore({ initial: props.library, persistence: { save: saveLibrary } });
  onCleanup(() => store.dispose());

  const [selectedLayer, setSelectedLayer] = createSignal<SceneId | undefined>(undefined);

  return (
    <main class="grid grid-rows-[1_2] h-screen gap-6 px-2 pt-2">
      {/* Eight columns for the eight loaders this grows into; two are live. */}
      <LayerPreviews selected={selectedLayer()} onSelect={setSelectedLayer} />
      {/* The GUI project is a separate process from the scenes, so its params
          live behind their own provider — the text selector is the only thing
          bound to it. */}
      <GuiProvider>
        <div class="grid grid-cols-3 gap-4">
          <SceneSelector />
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
