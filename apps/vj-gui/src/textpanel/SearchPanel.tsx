import { For, Show, createMemo, type JSX } from 'solid-js';
import { searchWordbank, type WordbankStore } from '@/wordbank/store';
import { TextChip } from './TextChip';
import styles from './SearchPanel.module.css';

export interface SearchPanelProps {
  store: WordbankStore;
  query: string;
  onApply: (text: string) => void;
}

export function SearchPanel(props: SearchPanelProps): JSX.Element {
  const rows = createMemo(() =>
    searchWordbank(props.store.state.lists, props.store.state.recent, props.query),
  );

  return (
    <div class={styles.panel}>
      <ul class={styles.rows}>
        <For each={rows()}>
          {(text) => (
            <li>
              <TextChip
                text={text}
                source="search"
                listId={null}
                index={null}
                onApply={props.onApply}
              />
            </li>
          )}
        </For>
        <Show when={rows().length === 0}>
          <li class={styles.empty}>Nothing matches.</li>
        </Show>
      </ul>
    </div>
  );
}
