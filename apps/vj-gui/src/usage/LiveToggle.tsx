import type { JSX } from 'solid-js';
import { useLiveMode } from './LiveMode';
import styles from './LiveToggle.module.css';

const STATES = {
  off: { label: 'Live off', title: 'Start tracking usage' },
  tracking: { label: 'Live', title: 'Tracking usage' },
  paused: { label: 'Paused', title: 'Tracking paused until the next change' },
} as const;

export function LiveToggle(): JSX.Element {
  const live = useLiveMode();
  const state = () => (!live.status().on ? 'off' : live.status().paused ? 'paused' : 'tracking');
  return (
    <button
      type="button"
      class={styles.toggle}
      data-state={state()}
      aria-pressed={live.status().on}
      title={STATES[state()].title}
      onClick={() => live.toggle()}
    >
      {STATES[state()].label}
    </button>
  );
}
