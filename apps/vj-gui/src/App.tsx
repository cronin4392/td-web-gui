import { onCleanup, type JSX } from 'solid-js';
import { GuiProvider, InputProvider } from './playback/clients';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { createWordbankStore } from './wordbank/store';
import { saveWordbank } from './wordbank/wordbank-api';
import { createShowInfoStore } from './showinfo/store';
import { saveShowDocument } from './showinfo/showinfo-api';
import { ShowInfoProvider } from './showinfo/context';
import type { Wordbank } from '@domain/wordbank/wordbank';
import type { ShowDocument } from '@domain/showinfo/showinfo';
import { EffectSelector } from './catalog/EffectSelector';
import { LayerPreviews } from './playback/LayerPreviews';
import { SceneSelector } from './catalog/SceneSelector';
import { TextSelector } from './wordbank/TextSelector';
import { Tools } from './playback/Tools';
import styles from './App.module.css';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchWordbank()`). */
  wordbank: Wordbank;
  showDocument: ShowDocument;
}

export function App(props: AppProps): JSX.Element {
  const store = createWordbankStore({
    initial: props.wordbank,
    persistence: { save: saveWordbank },
  });
  onCleanup(() => store.dispose());

  const showInfo = createShowInfoStore({
    initial: props.showDocument,
    persistence: { save: saveShowDocument },
  });
  onCleanup(() => showInfo.dispose());
  const flushShowInfo = () => showInfo.flush();
  window.addEventListener('pagehide', flushShowInfo);
  onCleanup(() => window.removeEventListener('pagehide', flushShowInfo));

  return (
    <GuiProvider>
      <InputProvider>
        <PlaybackProvider>
          <ShowInfoProvider store={showInfo}>
            <main class={styles.app}>
              <LayerPreviews class={styles.previews} />
              <SceneSelector class={styles.scenes} />
              <TextSelector store={store} showInfo={showInfo} />
              <EffectSelector />
              <Tools />
            </main>
          </ShowInfoProvider>
        </PlaybackProvider>
      </InputProvider>
    </GuiProvider>
  );
}
