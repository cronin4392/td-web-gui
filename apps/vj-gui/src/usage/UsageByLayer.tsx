import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { LayerEntry, LayerScores } from '@domain/usage/usage';
import { isZLayer, layerIds, layerNumber, type LayerId } from '@/playback/layers';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { fetchLayerScores } from './usage-api';
import styles from './UsageByLayer.module.css';

function layerLabel(layer: LayerId): string {
  return isZLayer(layer) ? layer : String(layerNumber(layer));
}

function formatScore(score: number): string {
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

export function UsageByLayer(): JSX.Element {
  let dialog!: HTMLDialogElement;
  const [scores, setScores] = createSignal<LayerScores>({});

  // A Z layer earns a column only once something has played on it; the stack's eight always show.
  const columns = createMemo(() =>
    layerIds.filter((layer) => !isZLayer(layer) || (scores()[layer]?.length ?? 0) > 0),
  );
  const ranks = createMemo(() => {
    const deepest = Math.max(0, ...columns().map((layer) => scores()[layer]?.length ?? 0));
    return Array.from({ length: deepest }, (_, rank) => rank);
  });

  function open(): void {
    void fetchLayerScores().then(setScores);
    dialog.showModal();
  }

  function cell(entry: LayerEntry | undefined): JSX.Element {
    return (
      <td class={styles.cell}>
        <Show when={entry}>
          {(played) => (
            <>
              <span class={styles.name} title={played().name}>
                {played().name}
              </span>
              <Show when={played().kind === 'effect'}>
                <span class={styles.kind}>FX</span>
              </Show>
              <span class={styles.score}>{formatScore(played().score)}</span>
            </>
          )}
        </Show>
      </td>
    );
  }

  return (
    <>
      <PanelHeaderButton label="Usage by layer" onClick={open}>
        ▦
      </PanelHeaderButton>
      <dialog ref={dialog} class={styles.dialog} aria-label="Usage by layer" closedby="any">
        <div class={styles.panel}>
          <PanelHeader title="Usage by layer">
            <PanelHeaderButton label="Close" onClick={() => dialog.close()}>
              ×
            </PanelHeaderButton>
          </PanelHeader>
          <div class={styles.scroll}>
            <table class={styles.table}>
              <thead>
                <tr>
                  <th class={styles.rank} scope="col">
                    #
                  </th>
                  <For each={columns()}>
                    {(layer) => (
                      <th class={styles.layer} scope="col">
                        {layerLabel(layer)}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={ranks()}>
                  {(rank) => (
                    <tr>
                      <th class={styles.rank} scope="row">
                        {rank + 1}
                      </th>
                      <For each={columns()}>{(layer) => cell(scores()[layer]?.[rank])}</For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={ranks().length === 0}>
              <p class={styles.empty}>Nothing recorded yet. Turn Live mode on to start.</p>
            </Show>
          </div>
        </div>
      </dialog>
    </>
  );
}
