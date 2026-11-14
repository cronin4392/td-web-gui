import { onCleanup, type JSX } from 'solid-js';
import { GuiClient } from '@/playback/clients';
import { asLayerId } from '@/playback/wire';
import { useTextState } from './context';

export function RigClearHandler(): JSX.Element {
  const { clearOverrides } = useTextState();

  onCleanup(
    GuiClient.useConnection().handle('clearLayer', (args) => {
      // Optional despite the schema: TD omits `args` entirely when it notifies without a payload.
      const layer = asLayerId(args?.layer);
      if (layer) clearOverrides(layer);
    }),
  );

  return null;
}
