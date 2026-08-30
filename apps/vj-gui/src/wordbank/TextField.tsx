/**
 * Hand-rolled rather than `td-core`'s `<TextInput commitOn="enter">`, whose
 * value *is* the bound param: here the store holds the override alone while the
 * input shows it against the Default's placeholder, so a field left alone reads
 * as empty-with-a-placeholder rather than as text someone entered.
 */

import { createEffect, createSignal, type JSX } from 'solid-js';
import type { TextField as TextFieldDef } from '@domain/wordbank/wordbank';
import type { LayerId } from '@/playback/layers';
import { hasPhraseDragData, readPhraseDragData } from './dnd';
import { useWordbank } from './WordbankProvider';
import styles from './TextField.module.css';

export interface TextFieldProps {
  field: TextFieldDef;
  /** 1-based position, naming the field while its Default is still blank. */
  position: number;
  /** The Layer this field is typed for; its override is what the input holds. */
  layer: LayerId;
  /** Each keystroke's draft text, which filters the phrase lists below; `''` once the edit ends. */
  onFilter: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function TextField(props: TextFieldProps): JSX.Element {
  const store = useWordbank();
  // A Text field has no name: its Default is how it is recognised, and the
  // position is all that is left to call it when that Default is blank.
  const label = () => props.field.defaultValue || `Text field ${props.position}`;
  const committed = () => store.state.overrides[props.layer]?.[props.field.id] ?? '';

  const [draft, setDraft] = createSignal(committed());
  let fieldRef!: HTMLTextAreaElement;

  createEffect(() => {
    const value = committed();
    if (document.activeElement !== fieldRef) setDraft(value);
  });

  function write(text: string): boolean {
    if (text === committed()) return false;
    store.setOverride(props.layer, props.field.id, text);
    return true;
  }

  function commit() {
    const text = draft();
    // Only a changed value reaches Recent: blur fires on every focus cycle, and
    // an untouched field must not keep bumping its own text back to the top.
    if (write(text) && text.trim()) store.commitRecent(text);
  }

  return (
    <div class={styles.field}>
      <button
        type="button"
        tabIndex={-1}
        class={styles.clear}
        title={`Clear ${label()}`}
        aria-label={`Clear ${label()}`}
        onClick={() => {
          setDraft('');
          write('');
          props.onFilter('');
        }}
      >
        Clear
      </button>
      <textarea
        ref={fieldRef}
        class={styles.input}
        rows={2}
        value={draft()}
        aria-label={label()}
        placeholder={props.field.defaultValue}
        onInput={(event) => {
          setDraft(event.currentTarget.value);
          props.onFilter(event.currentTarget.value);
        }}
        onFocus={() => props.onFocus()}
        onBlur={() => {
          commit();
          props.onBlur();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(committed());
            props.onFilter('');
          } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            // A textarea raises no implicit form submission, so Enter commits
            // from here; Shift+Enter is its line break.
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
          write(payload.phrase);
          store.commitRecent(payload.phrase);
        }}
      />
    </div>
  );
}
