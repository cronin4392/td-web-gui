import { createContext, onCleanup, useContext, type JSX } from 'solid-js';
import type { Wordbank } from '@domain/wordbank/wordbank';
import { createWordbankStore, type WordbankStore } from './store';
import { saveWordbank } from './wordbank-api';

const WordbankContext = createContext<WordbankStore>();

// Context, not a prop: the text selector and the layer previews are sibling subtrees that share this state.
export function WordbankProvider(props: {
  wordbank: Wordbank;
  children: JSX.Element;
}): JSX.Element {
  const store = createWordbankStore({
    initial: props.wordbank,
    persistence: { save: saveWordbank },
  });
  onCleanup(() => store.dispose());

  return <WordbankContext.Provider value={store}>{props.children}</WordbankContext.Provider>;
}

export function useWordbank(): WordbankStore {
  const ctx = useContext(WordbankContext);
  if (!ctx) throw new Error('useWordbank() called outside <WordbankProvider>');
  return ctx;
}
