import { createEffect, type JSX } from 'solid-js';
import { namedValues } from '@domain/showinfo/showinfo';
import { LoaderClient } from '@/playback/clients';
import type { LayerId } from '@/playback/layers';
import { layerTextListOf, useShowInfo } from './context';

export function TextDelivery(props: { layer: LayerId }): JSX.Element {
  const { state } = useShowInfo();
  const connection = LoaderClient.useConnection();
  const textList = LoaderClient.signal('textList');
  const textVars = LoaderClient.signal('textVars');

  createEffect(() => {
    // Re-sent on every (re)sync too, since a restarted loader comes back with whatever its tables last held.
    if (connection.status() !== 'synced') return;
    textList.setValue(
      layerTextListOf(state, props.layer).map((text) => [text]),
      { throttle: true },
    );
    textVars.setValue(Object.entries(namedValues(state.show)), { throttle: true });
  });

  return null;
}
