import { Show, type JSX } from 'solid-js';
import styles from './PickerToolbar.module.css';

export function PickerToolbar(props: {
  refreshing: boolean;
  error?: string;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <div class={styles.toolbar}>
      <button
        type="button"
        class={styles.refresh}
        disabled={props.refreshing}
        onClick={() => props.onRefresh()}
      >
        {props.refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <Show when={props.error}>{(message) => <p class={styles.error}>{message()}</p>}</Show>
    </div>
  );
}
