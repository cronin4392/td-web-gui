import { Show, type JSX } from 'solid-js';
import { PanelHeaderButton } from '@/ui/PanelHeader';
import styles from './PickerToolbar.module.css';

export function PickerToolbar(props: {
  refreshing: boolean;
  showHidden: boolean;
  byUsage: boolean;
  error?: string;
  onRefresh: () => void;
  onToggleShowHidden: () => void;
  onToggleByUsage: () => void;
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
        label={props.showHidden ? 'Hide hidden' : 'Show hidden'}
        pressed={props.showHidden}
        onClick={() => props.onToggleShowHidden()}
      >
        ◉
      </PanelHeaderButton>
      <PanelHeaderButton
        label={props.byUsage ? 'Stop sorting by usage' : 'Sort by usage'}
        pressed={props.byUsage}
        onClick={() => props.onToggleByUsage()}
      >
        ⇅
      </PanelHeaderButton>
    </>
  );
}
