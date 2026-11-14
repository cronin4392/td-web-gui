import type { JSX } from 'solid-js';
import { InputClient } from './clients';
import type { InputCalls } from './wire';
import styles from './BpmReadout.module.css';

export function BpmReadout(): JSX.Element {
  const connection = InputClient.useConnection();
  const bpm = InputClient.signal('bpm');
  const display = () => {
    const tempo = bpm.value();
    return tempo === undefined ? '—' : tempo.toFixed(0);
  };
  const offline = () => connection.status() !== 'synced';

  function step(call: keyof InputCalls): void {
    void connection
      .call(call)
      .catch((error: unknown) => console.warn(`[vj-gui] ${call} failed`, error));
  }

  return (
    <div class={styles.tempo}>
      <p class={styles.bpm}>
        <span class={styles.value}>{display()}</span>
        <span class={styles.unit}>BPM</span>
      </p>
      <div class={styles.steps} role="group" aria-label="Tempo step">
        <button
          type="button"
          class={styles.step}
          disabled={offline()}
          onClick={() => step('bpmHalf')}
          aria-label="Halve the tempo"
        >
          /2
        </button>
        <button
          type="button"
          class={styles.step}
          disabled={offline()}
          onClick={() => step('bpmDouble')}
          aria-label="Double the tempo"
        >
          ×2
        </button>
      </div>
    </div>
  );
}
