import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { defaultShowDocument, type ShowDocument, type ShowInfo } from '@domain/showinfo/showinfo';
import { createDebouncedSaver } from '@/platform/debounced-saver';

const DEFAULT_DEBOUNCE_MS = 200;

export function withSlot(
  texts: readonly string[] | undefined,
  slot: number,
  text: string,
): string[] {
  const next = [...(texts ?? [])];
  while (next.length <= slot) next.push('');
  next[slot] = text;
  return next;
}

export interface CreateShowInfoStoreOptions {
  initial?: ShowDocument;
  persistence?: { save: (doc: ShowDocument) => void | Promise<void> };
  debounceMs?: number;
}

export interface ShowInfoStore {
  state: ShowDocument;

  setShow: (show: ShowInfo) => void;
  setOverride: (layer: string, slot: number, text: string) => void;
  clearOverrides: (layer: string) => void;

  flush: () => void;
  dispose: () => void;
}

export function createShowInfoStore(options: CreateShowInfoStoreOptions = {}): ShowInfoStore {
  const [state, setState] = createStore<ShowDocument>(options.initial ?? defaultShowDocument());

  const saver = createDebouncedSaver({
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    label: 'show info',
    save: () =>
      options.persistence?.save({
        show: unwrap(state.show),
        overrides: unwrap(state.overrides),
      }),
  });

  function setShow(show: ShowInfo): void {
    const next = structuredClone(unwrap(show));
    if (JSON.stringify(next) === JSON.stringify(unwrap(state.show))) return;
    setState('show', reconcile(next));
    saver.schedule();
  }

  function setOverride(layer: string, slot: number, text: string): void {
    if (slot < 0) return;
    setState('overrides', layer, withSlot(state.overrides[layer], slot, text));
    saver.schedule();
  }

  function clearOverrides(layer: string): void {
    setState(
      produce((doc) => {
        delete doc.overrides[layer];
      }),
    );
    saver.schedule();
  }

  return {
    state,
    setShow,
    setOverride,
    clearOverrides,
    flush: saver.flush,
    dispose: saver.dispose,
  };
}
