import { For, Show, type JSX } from 'solid-js';
import { SHOW_LIST_ID } from './store';
import { PhraseChip } from './PhraseChip';
import styles from './RecentPanel.module.css';

export interface ShowPanelProps {
  phrases: readonly string[];
  onApply: (phrase: string) => void;
}

export function ShowPanel(props: ShowPanelProps): JSX.Element {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${SHOW_LIST_ID}`}
      aria-labelledby={`tab-${SHOW_LIST_ID}`}
      class={styles.panel}
    >
      <ul class={styles.rows}>
        <For each={props.phrases}>
          {(phrase) => (
            <li>
              <PhraseChip
                phrase={phrase}
                source="recent"
                tabId={null}
                index={null}
                onApply={props.onApply}
              />
            </li>
          )}
        </For>
        <Show when={props.phrases.length === 0}>
          <li class={styles.empty}>Nothing on in the show.</li>
        </Show>
      </ul>
    </div>
  );
}
