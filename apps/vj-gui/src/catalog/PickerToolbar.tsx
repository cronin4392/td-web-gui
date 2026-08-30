import { Show, type JSX } from 'solid-js';
import { PanelHeaderButton } from '@/ui/PanelHeader';
import styles from './PickerToolbar.module.css';

export function PickerToolbar(props: {
  refreshing: boolean;
  editing: boolean;
  error?: string;
  onRefresh: () => void;
  onToggleEditing: () => void;
}): JSX.Element {
  return (
    <>
      <Show when={props.error}>{(message) => <p class={styles.error}>{message()}</p>}</Show>
      <PanelHeaderButton
        label={props.refreshing ? 'Refreshing…' : 'Refresh'}
        disabled={props.refreshing}
        onClick={() => props.onRefresh()}
      >
        ↻
      </PanelHeaderButton>
      <PanelHeaderButton
        label={props.editing ? 'Done' : 'Edit'}
        pressed={props.editing}
        onClick={() => props.onToggleEditing()}
      >
        ✎
      </PanelHeaderButton>
    </>
  );
}
