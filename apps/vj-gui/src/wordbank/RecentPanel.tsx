/**
 * Recent-phrases tab panel — the pinned first tab in the strip (TabStrip),
 * backed by `store.state.recent` rather than `store.state.tabs`. Filtered by
 * the text fields above it like the other tabs' panels, but no
 * add/sort/reorder: recent order is store-managed (most-recently-committed
 * first), not user-arranged.
 */

import { For, Show, createMemo, type JSX } from 'solid-js';
import { RECENT_LIST_ID } from './store';
import { useWordbank } from './WordbankProvider';
import { PhraseChip } from './PhraseChip';
import styles from './RecentPanel.module.css';

export interface RecentPanelProps {
  /** Live text of whichever field is being typed in. */
  filter: string;
  onApply: (phrase: string) => void;
}

export function RecentPanel(props: RecentPanelProps): JSX.Element {
  const store = useWordbank();
  const rows = createMemo(() => {
    const q = props.filter.trim().toLowerCase();
    const recent = store.state.recent;
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
            <li>
              <PhraseChip
                phrase={phrase}
                source="recent"
                tabId={null}
                index={null}
                onApply={props.onApply}
                onDelete={() => store.deleteRecent(phrase)}
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
    </div>
  );
}
