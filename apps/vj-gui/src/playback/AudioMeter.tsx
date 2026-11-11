/**
 * The Input project's three analyser bands as bars, so a glance says whether
 * audio is reaching the rig at all. Must render inside `InputProvider`.
 *
 * Read-only by declaration, so there is nothing to drive here — the bars are
 * the whole control.
 */

import { For, type JSX } from 'solid-js';
import { InputClient } from './clients';
import { AUDIO_BANDS } from './wire';
import styles from './AudioMeter.module.css';

export function AudioMeter(): JSX.Element {
  const audio = InputClient.signal('audio');
  // The analyser is nominally 0–1, but a hot input overshoots and a bar wider
  // than its track would spill across the column.
  const level = (index: number) => Math.min(Math.max(audio.value()?.[index] ?? 0, 0), 1);

  return (
    <section class={styles.meter}>
      <h2 class="u-sr-only">Audio</h2>
      <For each={AUDIO_BANDS}>
        {(band, index) => (
          <p class={styles.band}>
            <span class={styles.label}>{band}</span>
            <span
              class={styles.track}
              role="meter"
              aria-label={band}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={level(index())}
            >
              <span class={styles.fill} style={{ scale: `${level(index())} 1` }} />
            </span>
          </p>
        )}
      </For>
    </section>
  );
}
