import { createEffect, type Accessor } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { resolveLayerText } from '@domain/wordbank/wordbank';
import { layerIds } from '@/playback/layers';
import type { LayerConnections } from '@/playback/clients';
import type { WordbankStore } from './store';

/** One effect per Layer, so an override re-pushes that loader alone and a
 * loader reaching `synced` re-pushes itself across a restarted scene. */
export function createTextPush(
  store: WordbankStore,
  connections: Accessor<LayerConnections>,
): void {
  for (const layer of layerIds) {
    createEffect(() => {
      const connection = connections()[layer];
      if (!connection || connection.status() !== 'synced') return;
      const lines = resolveLayerText(store.state.fields, store.state.overrides, layer).map(
        escapeNewlines,
      );
      void connection
        .call('setTextList', { lines })
        .catch((error: unknown) => console.warn('[vj-gui] setTextList failed', layer, error));
    });
  }
}
