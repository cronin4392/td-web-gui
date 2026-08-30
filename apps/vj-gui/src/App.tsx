import type { JSX } from 'solid-js';
import { GuiProvider, InputProvider } from './playback/clients';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { WordbankProvider } from './wordbank/WordbankProvider';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { EffectSelector } from './catalog/EffectSelector';
import { LayerPreviews } from './playback/LayerPreviews';
import { SceneSelector } from './catalog/SceneSelector';
import { TextSelector } from './wordbank/TextSelector';
import { Tools } from './playback/Tools';
import styles from './App.module.css';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchWordbank()`). */
  wordbank: Wordbank;
}

export function App(props: AppProps): JSX.Element {
  return (
    <GuiProvider>
      <InputProvider>
        <PlaybackProvider>
          <WordbankProvider wordbank={props.wordbank}>
            <main class={styles.app}>
              <LayerPreviews class={styles.previews} />
              <SceneSelector class={styles.scenes} />
              <TextSelector />
              <EffectSelector />
              <Tools />
            </main>
          </WordbankProvider>
        </PlaybackProvider>
      </InputProvider>
    </GuiProvider>
  );
}
