/**
 * A single phrase button, shared by the recent row and the phrase list
 * (TEXT_SELECTOR.md §2-3): click commits to the focused text field, drag carries the app's
 * custom-mime payload so it can be dropped on either text input or (list
 * source only) reordered within its tab. `onDelete` is optional so callers
 * without a delete affordance can simply omit it.
 */

import type { JSX } from 'solid-js';
import { setPhraseDragData, type PhraseDragPayload } from './dnd';
import styles from './PhraseChip.module.css';

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
    <div class={styles.chip}>
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
        class={styles.phrase}
        title={`Send "${props.phrase}"`}
      >
        {props.phrase}
      </button>
      {props.onDelete && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Delete "${props.phrase}"`}
          onClick={props.onDelete}
          class={styles.delete}
        >
          ×
        </button>
      )}
    </div>
  );
}
