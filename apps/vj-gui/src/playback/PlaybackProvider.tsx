import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import { defaultLayer, type LayerId } from './layers';
import { GuiClient, loadOnLayer, type LayerConnections, type LoaderConnection } from './clients';
import { asLayerId } from './wire';

export interface PlaybackContextValue {
  selectedLayer: Accessor<LayerId>;
  selectLayer: (layer: LayerId) => void;
  connections: Accessor<LayerConnections>;
  registerConnection: (layer: LayerId, connection: LoaderConnection | undefined) => void;
  loadTox: (path: string) => Promise<void>;
}

const PlaybackContext = createContext<PlaybackContextValue>();

/**
 * Owns the app's one selected layer and its live connections, so neither has
 * to be drilled as props through LayerPreviews' three-level tree or each
 * catalog selector.
 *
 * The selection is this app's, but the rig's MIDI select button drives it too:
 * TD fires `selectLayer` and the page follows. Registered here rather than in
 * `LayerPreviews` so a press lands whether or not the tiles are on screen. Must
 * render inside `GuiProvider`.
 */
export function PlaybackProvider(props: { children: JSX.Element }): JSX.Element {
  const [selectedLayer, selectLayer] = createSignal<LayerId>(defaultLayer);
  const [connections, setConnections] = createSignal<LayerConnections>({});

  // Not `createTDHandler`, which would bind `InputProvider` from here.
  onCleanup(
    GuiClient.useConnection().handle('selectLayer', (args) => {
      // Optional despite the schema: TD omits `args` entirely when it notifies
      // without a payload, and the throw would be swallowed as a dead press.
      const layer = asLayerId(args?.layer);
      if (layer) selectLayer(layer);
    }),
  );

  function registerConnection(layer: LayerId, connection: LoaderConnection | undefined): void {
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
