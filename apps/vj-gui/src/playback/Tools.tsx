/**
 * The narrow right-hand column, reading a different TouchDesigner process per
 * item — the Color schemes and beat period the GUI project holds, the audio
 * bands and tempo the Input project detects. Each factory reaches its own
 * provider, so this renders inside both.
 */

import type { JSX } from 'solid-js';
import { AudioMeter } from './AudioMeter';
import { BeatPeriod } from './BeatPeriod';
import { BpmReadout } from './BpmReadout';
import { ColorSelector } from './ColorSelector';
import { guiInstance, inputInstance } from './layers';
import { loaderInstances } from './wire';
import styles from './Tools.module.css';

export function Tools(): JSX.Element {
  return (
    <div class={styles.tools}>
      <ColorSelector class={styles.schemes} />
      <AudioMeter />
      <BpmReadout />
      <BeatPeriod />
      {/* Hidden for now — re-enable by dropping `u-hidden`. */}
      <p class={`${styles.binding} u-hidden`}>
        Bound to{' '}
        {[guiInstance, inputInstance, ...loaderInstances]
          .map((inst) => `${inst.id} at ${inst.url}`)
          .join(' · ')}
      </p>
    </div>
  );
}
