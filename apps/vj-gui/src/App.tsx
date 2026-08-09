import { onCleanup, type JSX } from 'solid-js';
import { guiInstance } from './playback/layers';
import { loaderInstances } from './playback/wire';
import { GuiProvider } from './playback/clients';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { createWordbankStore } from './wordbank/store';
import { saveWordbank } from './wordbank/wordbank-api';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { EffectSelector } from './catalog/EffectSelector';
import { LayerPreviews } from './playback/LayerPreviews';
import { SceneSelector } from './catalog/SceneSelector';
import { TextSelector } from './wordbank/TextSelector';
import styles from './App.module.css';

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

  return (
    <PlaybackProvider>
      <main class={styles.app}>
        <LayerPreviews />
        {/* The GUI project is a separate process from the scenes, so its params
            live behind their own provider — the text selector is the only thing
            bound to it. */}
        <GuiProvider>
          <div class={styles.columns}>
            <SceneSelector />
            <EffectSelector />
            <TextSelector store={store} />
          </div>
        </GuiProvider>
        {/* Hidden for now — re-enable by dropping `u-hidden`. */}
        <p class={`${styles.binding} u-hidden`}>
          Bound to{' '}
          {[guiInstance, ...loaderInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
        </p>
      </main>
    </PlaybackProvider>
  );
}
