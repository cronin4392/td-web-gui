import { onCleanup, type JSX } from 'solid-js';
import { guiInstance, sceneInstances } from './td.config';
import { GuiClient } from './td';
import { createVjGuiStore } from './store';
import { saveLibrary } from './library-api';
import type { Library } from './library';
import { ScenePreviews } from './components/ScenePreviews';
import { TextSelector } from './components/TextSelector';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchLibrary()`). */
  library: Library;
}

export function App(props: AppProps): JSX.Element {
  const store = createVjGuiStore({ initial: props.library, persistence: { save: saveLibrary } });
  onCleanup(() => store.dispose());

  return (
    <main class="flex h-screen flex-col px-2 pt-2">
      {/* Eight columns for the eight loaders this grows into; two are live. */}
      <ScenePreviews />
      {/* The GUI project is a separate process from the scenes, so its params
          live behind their own provider — the text selector is the only thing
          bound to it. */}
      <GuiClient.Provider url={guiInstance.url} instance={guiInstance.id}>
        <TextSelector store={store} />
      </GuiClient.Provider>
      {/* Hidden for now — re-enable by dropping the `hidden` class. */}
      <p class="mt-6 hidden shrink-0 text-sm text-neutral-500">
        Bound to{' '}
        {[guiInstance, ...sceneInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
      </p>
    </main>
  );
}
