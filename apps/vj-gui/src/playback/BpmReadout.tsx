import type { JSX } from 'solid-js';
import { InputClient } from './clients';
import styles from './BpmReadout.module.css';

export function BpmReadout(): JSX.Element {
  const bpm = InputClient.signal('bpm');
  const display = () => {
    const tempo = bpm.value();
    return tempo === undefined ? '—' : tempo.toFixed(0);
  };
  return (
    <p class={styles.bpm}>
      <span class={styles.value}>{display()}</span>
      <span class={styles.unit}>BPM</span>
    </p>
  );
}
