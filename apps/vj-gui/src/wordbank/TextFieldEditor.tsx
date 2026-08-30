import { createEffect, createSignal, on, type JSX } from 'solid-js';
import type { TextField as TextFieldDef } from '@domain/wordbank/wordbank';
import styles from './TextFieldEditor.module.css';

export function TextFieldEditor(props: {
  field: TextFieldDef;
  position: number;
  // False once removing this field would leave fewer than the wire carries.
  deletable: boolean;
  onSetDefault: (defaultValue: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const [defaultValue, setDefaultValue] = createSignal(props.field.defaultValue);
  // Pull the draft back when the stored Default moves under it, or a stale value would be written back on the next blur.
  createEffect(on(() => props.field.defaultValue, setDefaultValue, { defer: true }));

  const label = () => `text field ${props.position}`;

  return (
    <div class={styles.row}>
      <textarea
        class={styles.default}
        rows={2}
        value={defaultValue()}
        aria-label={`Default for ${label()}`}
        placeholder="Default"
        onInput={(event) => setDefaultValue(event.currentTarget.value)}
        onBlur={() => props.onSetDefault(defaultValue())}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDefaultValue(props.field.defaultValue);
          } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        class={styles.delete}
        disabled={!props.deletable}
        aria-label={`Remove ${label()}`}
        title={
          props.deletable ? `Remove ${label()}` : 'The wire carries these two fields — keep both'
        }
        onClick={() => props.onDelete()}
      >
        Remove
      </button>
    </div>
  );
}
