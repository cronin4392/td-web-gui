/**
 * A single phrase button, shared by the recent row and the phrase list
 * (TEXT_SELECTOR.md §2-3): click commits to Text 1, drag carries the app's
 * custom-mime payload so it can be dropped on either text input or (list
 * source only) reordered within its tab. `onDelete` is optional so callers
 * without a delete affordance can simply omit it.
 */

import type { JSX } from 'solid-js';
import { setPhraseDragData, type PhraseDragPayload } from '@/dnd';

export interface PhraseChipProps {
  phrase: string;
  source: PhraseDragPayload['source'];
  tabId: string | null;
  index: number | null;
  onApply: (phrase: string) => void;
  onDelete?: () => void;
}

export function PhraseChip(props: PhraseChipProps): JSX.Element {
  return (
    <div class="group flex w-full items-center rounded-md border border-neutral-700 bg-neutral-800">
      <button
        type="button"
        draggable="true"
        onDragStart={(event) => {
          if (!event.dataTransfer) return;
          setPhraseDragData(event.dataTransfer, {
            phrase: props.phrase,
            source: props.source,
            tabId: props.tabId,
            index: props.index,
          });
          event.dataTransfer.effectAllowed = 'copyMove';
        }}
        onClick={() => props.onApply(props.phrase)}
        class="min-w-0 flex-1 cursor-grab truncate px-2 py-1 text-left text-sm active:cursor-grabbing"
        title={`Send "${props.phrase}" to Text 1`}
      >
        {props.phrase}
      </button>
      {props.onDelete && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Delete "${props.phrase}"`}
          onClick={props.onDelete}
          class="shrink-0 px-2 py-1 text-xs text-neutral-500 hover:text-red-400"
        >
          ×
        </button>
      )}
    </div>
  );
}
