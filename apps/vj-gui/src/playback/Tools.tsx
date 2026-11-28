/**
 * The narrow right-hand column: the Color schemes, audio bands, tempo and beat
 * period the Input project owns. Renders inside `InputProvider`.
 */

import type { JSX } from 'solid-js';
import { AudioMeter } from './AudioMeter';
import { BeatPeriod } from './BeatPeriod';
import { BpmReadout } from './BpmReadout';
import { ColorSelector } from './ColorSelector';
import { inputInstance } from './layers';
import { loaderInstances } from './wire';
import { PanelHeader } from '@/ui/PanelHeader';
import { LiveToggle } from '@/usage/LiveToggle';
import { UsageByLayer } from '@/usage/UsageByLayer';
import styles from './Tools.module.css';

export function Tools(): JSX.Element {
  return (
    <div class={styles.tools}>
      <PanelHeader title="Tools">
        <UsageByLayer />
        <LiveToggle />
      </PanelHeader>
      <ColorSelector class={styles.schemes} />
      <AudioMeter />
      <div class={styles.tempo}>
        <BpmReadout />
        <BeatPeriod />
      </div>
      {/* Hidden for now — re-enable by dropping `u-hidden`. */}
      <p class={`${styles.binding} u-hidden`}>
        Bound to{' '}
        {[inputInstance, ...loaderInstances].map((inst) => `${inst.id} at ${inst.url}`).join(' · ')}
      </p>
    </div>
  );
}
