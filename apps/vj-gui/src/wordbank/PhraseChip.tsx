import type { JSX } from 'solid-js';
import { setPhraseDragData, type PhraseDragPayload } from './dnd';
import styles from './PhraseChip.module.css';

export interface PhraseChipProps {
  phrase: string;
  source: PhraseDragPayload['source'];
  tabId: string | null;
  index: number | null;
  onApply: (phrase: string) => void;
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
    </div>
  );
}
