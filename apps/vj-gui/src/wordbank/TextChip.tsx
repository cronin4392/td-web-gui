import type { JSX } from 'solid-js';
import { setTextDragData, type TextDragPayload } from './dnd';
import styles from './TextChip.module.css';

export interface TextChipProps {
  text: string;
  source: TextDragPayload['source'];
  tabId: string | null;
  index: number | null;
  onApply: (text: string) => void;
}

export function TextChip(props: TextChipProps): JSX.Element {
  return (
    <div class={styles.chip}>
      <button
        type="button"
        draggable="true"
        onDragStart={(event) => {
          if (!event.dataTransfer) return;
          setTextDragData(event.dataTransfer, {
            text: props.text,
            source: props.source,
            tabId: props.tabId,
            index: props.index,
          });
          event.dataTransfer.effectAllowed = 'copyMove';
        }}
        onClick={() => props.onApply(props.text)}
        class={styles.text}
        title={`Apply "${props.text}"`}
      >
        {props.text}
      </button>
    </div>
  );
}
