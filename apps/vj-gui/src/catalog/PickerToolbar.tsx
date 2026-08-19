import { Show, type JSX } from 'solid-js';
import styles from './PickerToolbar.module.css';

export function PickerToolbar(props: {
  refreshing: boolean;
  editing: boolean;
  error?: string;
  onRefresh: () => void;
  onToggleEditing: () => void;
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
      <button
        type="button"
        class={styles.edit}
        aria-pressed={props.editing}
        onClick={() => props.onToggleEditing()}
      >
        {props.editing ? 'Done' : 'Edit'}
      </button>
      <Show when={props.error}>{(message) => <p class={styles.error}>{message()}</p>}</Show>
    </div>
  );
}
