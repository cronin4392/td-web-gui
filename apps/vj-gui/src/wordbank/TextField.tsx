import { createEffect, createSignal, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { hasTextDragData, readTextDragData } from './dnd';
import styles from './TextField.module.css';

export interface TextFieldProps {
  label: string;
  /** Carries `\n` escapes, while `onApply` receives real newlines. */
  value: string;
  placeholder: string;
  onApply: (text: string) => void;
  onClear: () => void;
  onFilter: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** True while a press elsewhere in the Text panel is picking for this field, so losing focus is not a click-away. */
  isPicking: () => boolean;
}

export function TextField(props: TextFieldProps): JSX.Element {
  let fieldRef!: HTMLTextAreaElement;
  const [draft, setDraft] = createSignal(unescapeNewlines(props.value));

  createEffect(() => {
    const value = unescapeNewlines(props.value);
    if (document.activeElement !== fieldRef) setDraft(value);
  });

  function apply() {
    if (escapeNewlines(draft()) === props.value) return;
    props.onApply(draft());
  }

  return (
    <div class={styles.field}>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setDraft('');
          props.onClear();
        }}
        class={styles.clear}
        title={`Clear ${props.label}`}
      >
        Clear
      </button>
      <textarea
        ref={fieldRef}
        rows={2}
        value={draft()}
        placeholder={unescapeNewlines(props.placeholder)}
        aria-label={props.label}
        class={styles.input}
        onFocus={props.onFocus}
        onBlur={() => {
          if (props.isPicking()) setDraft(unescapeNewlines(props.value));
          else apply();
          props.onBlur();
        }}
        onInput={(event) => {
          setDraft(event.currentTarget.value);
          props.onFilter(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(unescapeNewlines(props.value));
            props.onFilter('');
          } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            apply();
            props.onFilter('');
          }
        }}
        onDragOver={(event) => {
          if (hasTextDragData(event.dataTransfer!)) event.preventDefault();
        }}
        onDrop={(event) => {
          const payload = readTextDragData(event.dataTransfer!);
          if (!payload) return;
          event.preventDefault();
          setDraft(payload.text);
          props.onApply(payload.text);
        }}
      />
    </div>
  );
}
