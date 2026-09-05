import { For, Show, createMemo, type JSX } from 'solid-js';
import { RECENT_LIST_ID, type WordbankStore } from './store';
import { createContextMenu } from '@/ui/ContextMenu';
import { PhraseChip } from './PhraseChip';
import styles from './RecentPanel.module.css';

export interface RecentPanelProps {
  store: WordbankStore;
  /** Live text of whichever field is being typed in. */
  filter: string;
  onApply: (phrase: string) => void;
}

export function RecentPanel(props: RecentPanelProps): JSX.Element {
  const menu = createContextMenu();

  const rows = createMemo(() => {
    const q = props.filter.trim().toLowerCase();
    const recent = props.store.state.recent;
    return q ? recent.filter((phrase) => phrase.toLowerCase().includes(q)) : recent;
  });

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${RECENT_LIST_ID}`}
      aria-labelledby={`tab-${RECENT_LIST_ID}`}
      class={styles.panel}
    >
      <ul class={styles.rows}>
        <For each={rows()}>
          {(phrase) => (
            <li
              onContextMenu={(event) =>
                menu.open(event, [
                  {
                    label: 'Delete',
                    danger: true,
                    onSelect: () => props.store.deleteRecent(phrase),
                  },
                ])
              }
            >
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
        <Show when={rows().length === 0}>
          <li class={styles.empty}>
            {props.filter.trim() ? 'No phrases match.' : 'Nothing recent yet.'}
          </li>
        </Show>
      </ul>

      {menu.element}
    </div>
  );
}
