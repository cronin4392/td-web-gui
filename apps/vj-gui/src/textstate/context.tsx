import { createContext, useContext, type JSX } from 'solid-js';
import { actTextList, layerTextList, type TextState } from '@domain/textstate/textstate';
import type { TextStateStore } from './store';

const TextStateContext = createContext<TextStateStore>();

export function TextStateProvider(props: {
  store: TextStateStore;
  children: JSX.Element;
}): JSX.Element {
  return (
    <TextStateContext.Provider value={props.store}>{props.children}</TextStateContext.Provider>
  );
}

export function useTextState(): TextStateStore {
  const store = useContext(TextStateContext);
  if (!store) throw new Error('useTextState needs a <TextStateProvider> above it');
  return store;
}

export function layerTextListOf(doc: TextState, layer: string): string[] {
  return layerTextList(actTextList(doc.show), doc.overrides[layer] ?? []);
}
