import { createEffect, createSignal, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { hasPhraseDragData, readPhraseDragData } from './dnd';
import styles from './TextField.module.css';

export interface TextFieldProps {
  label: string;
  /** The stored override, with `\n` escapes; `''` when the layer uses the act text list. */
  value: string;
  /** Shown while `value` is blank — the act text list's entry for this slot. */
  placeholder: string;
  /** Receives the committed text with real newlines. */
  onCommit: (text: string) => void;
  onClear: () => void;
  onFilter: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function TextField(props: TextFieldProps): JSX.Element {
  let fieldRef!: HTMLTextAreaElement;
  const [draft, setDraft] = createSignal(unescapeNewlines(props.value));

  createEffect(() => {
    const value = unescapeNewlines(props.value);
    if (document.activeElement !== fieldRef) setDraft(value);
  });

  function commit() {
    if (escapeNewlines(draft()) === props.value) return;
    props.onCommit(draft());
  }

  return (
    <div class={styles.field}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => props.onClear()}
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
          commit();
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
            commit();
            props.onFilter('');
          }
        }}
        onDragOver={(event) => {
          if (hasPhraseDragData(event.dataTransfer!)) event.preventDefault();
        }}
        onDrop={(event) => {
          const payload = readPhraseDragData(event.dataTransfer!);
          if (!payload) return;
          event.preventDefault();
          setDraft(payload.phrase);
          props.onCommit(payload.phrase);
        }}
      />
    </div>
  );
}
