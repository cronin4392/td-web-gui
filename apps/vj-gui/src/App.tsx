import { onCleanup, type JSX } from 'solid-js';
import { guiInstance, inputInstance } from './playback/layers';
import { loaderInstances } from './playback/wire';
import { GuiProvider, InputProvider } from './playback/clients';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { StatusBar } from './playback/StatusBar';
import { createWordbankStore } from './wordbank/store';
import { saveWordbank } from './wordbank/wordbank-api';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { ColorSelector } from './playback/ColorSelector';
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
    <GuiProvider>
      <InputProvider>
        <PlaybackProvider>
          <main class={styles.app}>
            <LayerPreviews />
            <div class={styles.columns}>
              <SceneSelector />
              <EffectSelector />
              <TextSelector store={store} />
              <ColorSelector />
            </div>
            <StatusBar />
            {/* Hidden for now — re-enable by dropping `u-hidden`. */}
            <p class={`${styles.binding} u-hidden`}>
              Bound to{' '}
              {[guiInstance, inputInstance, ...loaderInstances]
                .map((inst) => `${inst.id} at ${inst.url}`)
                .join(' · ')}
            </p>
          </main>
        </PlaybackProvider>
      </InputProvider>
    </GuiProvider>
  );
}
