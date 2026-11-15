import { createMemo, onCleanup, type JSX } from 'solid-js';
import { useTextState } from '@/textstate/context';
import { InputClient, loadOnLayer } from './clients';
import { usePlayback } from './PlaybackProvider';

interface Clipboard {
  path: string;
  layout?: string;
  color?: string;
  overrides: string[];
}

/** The rig's MIDI store/recall buttons: copy the selected layer's scene, layout,
 * color and text overrides, and paste them onto whichever layer is selected
 * later. Must render inside `PlaybackProvider` and `TextStateProvider`. */
export function RigClipboardHandler(): JSX.Element {
  const { selectedLayer, connections } = usePlayback();
  const textState = useTextState();
  const input = InputClient.useConnection();
  let clipboard: Clipboard | undefined;

  // Memoized, like PlaybackProvider's level binding: `signal()` warns on every call for a read-only name.
  const selected = createMemo(() => {
    const connection = connections()[selectedLayer()];
    return (
      connection && {
        activeScene: connection.signal('activeScene'),
        layout: connection.signal('layout'),
        color: connection.signal('color'),
      }
    );
  });

  onCleanup(
    input.handle('copyLayer', () => {
      const path = selected()?.activeScene.value();
      if (!path) return;
      clipboard = {
        path,
        layout: selected()?.layout.value(),
        color: selected()?.color.value(),
        overrides: [...(textState.state.overrides[selectedLayer()] ?? [])],
      };
    }),
  );

  onCleanup(
    input.handle('pasteLayer', async () => {
      if (!clipboard) return;
      const { overrides, ...scene } = clipboard;
      const layer = selectedLayer();
      try {
        await loadOnLayer(layer, connections(), scene);
        textState.setOverrides(layer, overrides);
      } catch (error) {
        console.warn('[vj-gui] paste failed', error);
      }
    }),
  );

  return null;
}
