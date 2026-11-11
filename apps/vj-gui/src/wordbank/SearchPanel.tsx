import { For, Show, createMemo, type JSX } from 'solid-js';
import { searchPhrases, type WordbankStore } from './store';
import { PhraseChip } from './PhraseChip';
import styles from './SearchPanel.module.css';

export interface SearchPanelProps {
  store: WordbankStore;
  query: string;
  onApply: (phrase: string) => void;
}

export function SearchPanel(props: SearchPanelProps): JSX.Element {
  const rows = createMemo(() =>
    searchPhrases(props.store.state.lists, props.store.state.recent, props.query),
  );

  return (
    <div class={styles.panel}>
      <ul class={styles.rows}>
        <For each={rows()}>
          {(phrase) => (
            <li>
              <PhraseChip
                phrase={phrase}
                source="search"
                tabId={null}
                index={null}
                onApply={props.onApply}
              />
            </li>
          )}
        </For>
        <Show when={rows().length === 0}>
          <li class={styles.empty}>No phrases match.</li>
        </Show>
      </ul>
    </div>
  );
}
