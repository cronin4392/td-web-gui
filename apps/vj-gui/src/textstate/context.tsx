import { createContext, useContext, type JSX } from 'solid-js';
import { actTextList, layerTextList, type ShowDocument } from '@domain/showinfo/showinfo';
import type { ShowInfoStore } from './store';

const ShowInfoContext = createContext<ShowInfoStore>();

export function ShowInfoProvider(props: {
  store: ShowInfoStore;
  children: JSX.Element;
}): JSX.Element {
  return <ShowInfoContext.Provider value={props.store}>{props.children}</ShowInfoContext.Provider>;
}

export function useShowInfo(): ShowInfoStore {
  const store = useContext(ShowInfoContext);
  if (!store) throw new Error('useShowInfo needs a <ShowInfoProvider> above it');
  return store;
}

export function layerTextListOf(doc: ShowDocument, layer: string): string[] {
  return layerTextList(actTextList(doc.show), doc.overrides[layer] ?? []);
}
