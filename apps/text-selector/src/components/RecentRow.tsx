/**
 * Recent-phrases row (TEXT_SELECTOR.md §2). Pure render of `store.state.recent`
 * — the store owns dedupe/cap/ordering.
 */

import { For, Show, type JSX } from 'solid-js'
import { PhraseChip } from './PhraseChip'

export interface RecentRowProps {
  recent: string[]
  onApply: (phrase: string) => void
  onDelete: (phrase: string) => void
}

export function RecentRow(props: RecentRowProps): JSX.Element {
  return (
    <Show when={props.recent.length > 0}>
      <div>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent</h2>
        <div class="flex flex-col gap-1">
          <For each={props.recent}>
            {(phrase) => (
              <PhraseChip
                phrase={phrase}
                source="recent"
                tabId={null}
                index={null}
                onApply={props.onApply}
                onDelete={() => props.onDelete(phrase)}
              />
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
