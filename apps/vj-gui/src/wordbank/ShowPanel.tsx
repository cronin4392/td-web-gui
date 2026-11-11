import { For, Show, type JSX } from 'solid-js';
import { SHOW_TAB_ID } from './store';
import { TextChip } from './TextChip';
import styles from './RecentPanel.module.css';

export interface ShowPanelProps {
  texts: readonly string[];
  onApply: (text: string) => void;
}

export function ShowPanel(props: ShowPanelProps): JSX.Element {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${SHOW_TAB_ID}`}
      aria-labelledby={`tab-${SHOW_TAB_ID}`}
      class={styles.panel}
    >
      <ul class={styles.rows}>
        <For each={props.texts}>
          {(text) => (
            <li>
              <TextChip
                text={text}
                source="show"
                tabId={null}
                index={null}
                onApply={props.onApply}
              />
            </li>
          )}
        </For>
        <Show when={props.texts.length === 0}>
          <li class={styles.empty}>Nothing on in the show.</li>
        </Show>
      </ul>
    </div>
  );
}
