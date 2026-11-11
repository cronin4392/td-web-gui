import { onCleanup, type JSX } from 'solid-js';
import { GuiProvider, InputProvider } from './playback/clients';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { createWordbankStore } from './wordbank/store';
import { saveWordbank } from './wordbank/wordbank-api';
import { createTextStateStore } from './textstate/store';
import { saveTextState } from './textstate/textstate-api';
import { TextStateProvider } from './textstate/context';
import type { Wordbank } from '@domain/wordbank/wordbank';
import type { TextState } from '@domain/textstate/textstate';
import { EffectSelector } from './catalog/EffectSelector';
import { LayerPreviews } from './playback/LayerPreviews';
import { SceneSelector } from './catalog/SceneSelector';
import { TextSelector } from './wordbank/TextSelector';
import { Tools } from './playback/Tools';
import styles from './App.module.css';

export interface AppProps {
  /** Hydrated by `index.tsx` before mount (via `fetchWordbank()`). */
  wordbank: Wordbank;
  showDocument: TextState;
}

export function App(props: AppProps): JSX.Element {
  const store = createWordbankStore({
    initial: props.wordbank,
    persistence: { save: saveWordbank },
  });
  onCleanup(() => store.dispose());

  const textState = createTextStateStore({
    initial: props.showDocument,
    persistence: { save: saveTextState },
  });
  onCleanup(() => textState.dispose());
  const flushTextState = () => textState.flush();
  window.addEventListener('pagehide', flushTextState);
  onCleanup(() => window.removeEventListener('pagehide', flushTextState));

  return (
    <GuiProvider>
      <InputProvider>
        <PlaybackProvider>
          <TextStateProvider store={textState}>
            <main class={styles.app}>
              <LayerPreviews class={styles.previews} />
              <SceneSelector class={styles.scenes} />
              <TextSelector store={store} textState={textState} />
              <EffectSelector />
              <Tools />
            </main>
          </TextStateProvider>
        </PlaybackProvider>
      </InputProvider>
    </GuiProvider>
  );
}
