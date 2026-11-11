import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import { defaultLayer, type LayerId } from './layers';
import {
  GuiClient,
  InputClient,
  loadOnLayer,
  type LayerConnections,
  type LoaderConnection,
} from './clients';
import { asLayerId } from './wire';

export interface PlaybackContextValue {
  /** Falls back to {@link defaultLayer} until the Input project has synced, and
   * for a par holding a letter that names no loader. */
  selectedLayer: Accessor<LayerId>;
  selectLayer: (layer: LayerId) => void;
  /** The selected layer's fader, `0` while nothing is connected — anything above
   * it means whatever is loaded there is on the audience's screen. */
  selectedLevel: Accessor<number>;
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
 * The selection lives on the Input project's `selectedLoader` par rather than in
 * a signal here, so the rig's own Python can read which loader is selected — a
 * browser-side signal is unreachable from TouchDesigner, and the projects are
 * separate processes that can't read each other's operators. Writing the par
 * *is* selecting: the write is optimistic, so a click moves the UI without
 * waiting on TD, and TD's broadcast carries it to every other client. TD is
 * authoritative on connect, so a reload restores the rig's selection rather
 * than resetting it.
 *
 * The GUI project's MIDI select button drives it too, by firing `selectLayer` at
 * the page. Registered here rather than in `LayerPreviews` so a press lands
 * whether or not the tiles are on screen. Must render inside `GuiProvider` and
 * `InputProvider`.
 */
export function PlaybackProvider(props: { children: JSX.Element }): JSX.Element {
  const selection = InputClient.useConnection().signal('selectedLoader');
  const selectedLayer = (): LayerId => asLayerId(selection.value()) ?? defaultLayer;
  const selectLayer = (layer: LayerId): void => selection.setValue(layer);
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

  // The binding is memoized rather than the value: `signal()` warns on every
  // call for a read-only name, and `level` arrives frame by frame.
  const levelBinding = createMemo(() => connections()[selectedLayer()]?.signal('level'));
  const selectedLevel = () => levelBinding()?.value() ?? 0;

  function registerConnection(layer: LayerId, connection: LoaderConnection | undefined): void {
    setConnections((prev) => ({ ...prev, [layer]: connection }));
  }

  function loadTox(path: string): Promise<void> {
    return loadOnLayer(selectedLayer(), connections(), path);
  }

  const value: PlaybackContextValue = {
    selectedLayer,
    selectLayer,
    selectedLevel,
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
