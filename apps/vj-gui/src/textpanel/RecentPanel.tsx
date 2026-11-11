import { For, Show, type JSX } from 'solid-js';
import { RECENT_TAB_ID, type WordbankStore } from '@/wordbank/store';
import { createContextMenu } from '@/ui/ContextMenu';
import { TextChip } from './TextChip';
import styles from './RecentPanel.module.css';

export interface RecentPanelProps {
  store: WordbankStore;
  onApply: (text: string) => void;
}

export function RecentPanel(props: RecentPanelProps): JSX.Element {
  const menu = createContextMenu();
  const rows = () => props.store.state.recent;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${RECENT_TAB_ID}`}
      aria-labelledby={`tab-${RECENT_TAB_ID}`}
      class={styles.panel}
    >
      <ul class={styles.rows}>
        <For each={rows()}>
          {(text) => (
            <li
              onContextMenu={(event) =>
                menu.open(event, [
                  {
                    label: 'Delete',
                    danger: true,
                    onSelect: () => props.store.deleteRecent(text),
                  },
                ])
              }
            >
              <TextChip
                text={text}
                source="recent"
                listId={null}
                index={null}
                onApply={props.onApply}
              />
            </li>
          )}
        </For>
        <Show when={rows().length === 0}>
          <li class={styles.empty}>Nothing recent yet.</li>
        </Show>
      </ul>

      {menu.element}
    </div>
  );
}
