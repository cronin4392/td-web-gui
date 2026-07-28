import { createContext, createSignal, useContext, type Accessor, type JSX } from 'solid-js';
import type { TDConnection } from 'td-core';
import { defaultLayer, type LayerId } from './layers';
import { loadOnLayer, type LayerConnections } from './clients';

export interface PlaybackContextValue {
  selectedLayer: Accessor<LayerId>;
  selectLayer: (layer: LayerId) => void;
  connections: Accessor<LayerConnections>;
  registerConnection: (layer: LayerId, connection: TDConnection | undefined) => void;
  loadTox: (path: string) => Promise<void>;
}

const PlaybackContext = createContext<PlaybackContextValue>();

/**
 * Owns the app's one selected layer and its live connections, so neither has
 * to be drilled as props through LayerPreviews' three-level tree or each
 * catalog selector.
 */
export function PlaybackProvider(props: { children: JSX.Element }): JSX.Element {
  const [selectedLayer, selectLayer] = createSignal<LayerId>(defaultLayer);
  const [connections, setConnections] = createSignal<LayerConnections>({});

  function registerConnection(layer: LayerId, connection: TDConnection | undefined): void {
    setConnections((prev) => ({ ...prev, [layer]: connection }));
  }

  function loadTox(path: string): Promise<void> {
    return loadOnLayer(selectedLayer(), connections(), path);
  }

  const value: PlaybackContextValue = {
    selectedLayer,
    selectLayer,
    connections,
    registerConnection,
    loadTox,
  };

  return <PlaybackContext.Provider value={value}>{props.children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlayback() called outside <PlaybackProvider>');
  return ctx;
}
