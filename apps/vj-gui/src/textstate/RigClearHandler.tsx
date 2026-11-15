import { onCleanup, type JSX } from 'solid-js';
import { LoaderClient } from '@/playback/clients';
import type { LayerId } from '@/playback/layers';
import { useTextState } from './context';

export function RigClearHandler(props: { layer: LayerId }): JSX.Element {
  const { clearOverrides } = useTextState();

  onCleanup(LoaderClient.useConnection().handle('cleared', () => clearOverrides(props.layer)));

  return null;
}
