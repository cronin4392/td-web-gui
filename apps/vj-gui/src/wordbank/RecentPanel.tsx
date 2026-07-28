/**
 * Recent-phrases tab panel — the pinned first tab in the strip (TabStrip),
 * backed by `store.state.recent` rather than `store.state.tabs`. Filterable
 * like the other tabs' panels, but no add/sort/reorder: recent order is
 * store-managed (most-recently-committed first), not user-arranged.
 */

import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { RECENT_TAB_ID, type VjGuiStore } from './store';
import { PhraseChip } from './PhraseChip';

export interface RecentPanelProps {
  store: VjGuiStore;
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
      id={`tabpanel-${RECENT_TAB_ID}`}
      aria-labelledby={`tab-${RECENT_TAB_ID}`}
      class="flex h-full flex-col"
    >
      <input
        type="search"
        value={filter()}
        onInput={(event) => setFilter(event.currentTarget.value)}
        placeholder="filter…"
        aria-label="Filter recent phrases"
        class="w-full shrink-0 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500"
      />

      <ul class="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
          <li class="px-1 py-2 text-sm text-neutral-500">
            {filter().trim() ? 'No phrases match.' : 'Nothing recent yet.'}
          </li>
        </Show>
      </ul>
    </div>
  );
}
