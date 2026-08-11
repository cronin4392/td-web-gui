/**
 * The bar along the bottom, reading a different TouchDesigner process per item —
 * the tempo the Input project detects, the beat period the GUI project holds.
 * Neither carries a provider: each factory reaches its own, wherever it sits.
 */

import type { JSX } from 'solid-js';
import { BeatPeriod } from './BeatPeriod';
import { BpmReadout } from './BpmReadout';
import styles from './StatusBar.module.css';

export function StatusBar(): JSX.Element {
  return (
    <div class={styles.bar}>
      <BpmReadout />
      <BeatPeriod />
    </div>
  );
}
