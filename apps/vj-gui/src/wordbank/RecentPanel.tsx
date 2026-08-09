/**
 * Recent-phrases tab panel — the pinned first tab in the strip (TabStrip),
 * backed by `store.state.recent` rather than `store.state.tabs`. Filterable
 * like the other tabs' panels, but no add/sort/reorder: recent order is
 * store-managed (most-recently-committed first), not user-arranged.
 */

import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { RECENT_LIST_ID, type WordbankStore } from './store';
import { PhraseChip } from './PhraseChip';
import styles from './RecentPanel.module.css';

export interface RecentPanelProps {
  store: WordbankStore;
  onApply: (phrase: string) => void;
}

export function RecentPanel(props: RecentPanelProps): JSX.Element {
  const [filter, setFilter] = createSignal('');

  const rows = createMemo(() => {
    const q = filter().trim().toLowerCase();
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
      <input
        type="search"
        value={filter()}
        onInput={(event) => setFilter(event.currentTarget.value)}
        placeholder="filter…"
        aria-label="Filter recent phrases"
        class={styles.filter}
      />

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
                onDelete={() => props.store.deleteRecent(phrase)}
              />
            </li>
          )}
        </For>
        <Show when={rows().length === 0}>
          <li class={styles.empty}>
            {filter().trim() ? 'No phrases match.' : 'Nothing recent yet.'}
          </li>
        </Show>
      </ul>
    </div>
  );
}
