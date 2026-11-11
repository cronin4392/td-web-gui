/**
 * A single Text 1 / Text 2 field (TEXT_SELECTOR.md §1, §4): a `<form>`-wrapped
 * `commitOn="enter"` input, feeding the recent list on commit, and a drop
 * target for phrase chips (custom-mime only — plain text dragged in from
 * outside the app is not accepted). Typing also drives the phrase-list filter,
 * and focusing makes this the field a clicked phrase lands in.
 *
 * `multiline` makes it a textarea: Enter still commits, Shift+Enter inserts a
 * line break, and `td-core` carries the breaks to TD as `\n` escapes.
 */

import type { JSX } from 'solid-js';
import { hasPhraseDragData, readPhraseDragData } from './dnd';
import { GuiClient, type LayerTextParamName } from '@/playback/clients';
import styles from './TextField.module.css';

export interface TextFieldProps {
  /** Text param of the *selected* scene loader, e.g. `sceneAText1`. */
  name: LayerTextParamName;
  label: string;
  commitRecent: (phrase: string) => void;
  /** Commit a phrase to a named TD text param and record it as recent — the single "apply" path shared with `RecentPanel`/`PhraseList`'s `onApply`. */
  applyPhrase: (name: LayerTextParamName, phrase: string) => void;
  /** Clear this field's TD text param. */
  onClear: (name: LayerTextParamName) => void;
  /** Each keystroke's draft text, which filters the phrase lists below; `''` once the edit ends. */
  onFilter: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function TextField(props: TextFieldProps): JSX.Element {
  return (
    // No onSubmit here: <TextInput commitOn="enter"> already attaches its own
    // submit listener directly to this ancestor form (preventDefault + commit).
    <form class={styles.field}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => props.onClear(props.name)}
        class={styles.clear}
        title={`Clear ${props.label}`}
      >
        Clear
      </button>
      <GuiClient.TextInput
        id={props.name}
        name={props.name}
        commitOn="enter"
        multiline
        rows={2}
        onCommit={props.commitRecent}
        placeholder={props.label}
        aria-label={props.label}
        class={styles.input}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onInput={(event) => props.onFilter(event.currentTarget.value)}
        onKeyDown={(event) => {
          // Enter commits, Escape reverts — either way the draft stops being a
          // query. Shift+Enter is this textarea's line break, so it isn't one.
          if (
            event.key === 'Escape' ||
            (event.key === 'Enter' && !event.shiftKey && !event.isComposing)
          )
            props.onFilter('');
        }}
        onDragOver={(event) => {
          if (hasPhraseDragData(event.dataTransfer!)) event.preventDefault();
        }}
        onDrop={(event) => {
          const payload = readPhraseDragData(event.dataTransfer!);
          if (!payload) return;
          event.preventDefault();
          props.applyPhrase(props.name, payload.phrase);
        }}
      />
    </form>
  );
}
