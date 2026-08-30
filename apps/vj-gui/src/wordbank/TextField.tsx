/**
 * A single Text field: a textarea whose Default
 * stands in for an empty input — shown as the placeholder, and sent in the
 * input's place — feeding the recent list on commit, and a drop target for
 * phrase chips (custom-mime only — plain text dragged in from outside the app
 * is not accepted). Typing also drives the phrase-list filter, and focusing
 * makes this the field a clicked phrase lands in.
 *
 * Enter commits, Shift+Enter inserts a line break, Escape reverts, blur
 * commits — `td-core`'s own `<TextInput commitOn="enter">` in all but one
 * respect, which is why this is hand-rolled: that component's value *is* the
 * bound param, and here the two differ. The param holds the effective value
 * (typed text, or the Default), while the input shows the typed text only, so
 * a field left alone reads as empty-with-a-placeholder rather than as text
 * someone entered.
 */

import { createEffect, createSignal, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import type { TextField as TextFieldDef } from '@domain/wordbank/wordbank';
import { hasPhraseDragData, readPhraseDragData } from './dnd';
import type { TextFieldBinding } from './fieldBinding';
import { textOverride, wireDefault } from './textOverride';
import styles from './TextField.module.css';

export interface TextFieldProps {
  field: TextFieldDef;
  /** 1-based position, naming the field while its Default is still blank. */
  position: number;
  /** Where this field's value lives for the selected Layer. */
  binding: TextFieldBinding;
  commitRecent: (phrase: string) => void;
  /** Each keystroke's draft text, which filters the phrase lists below; `''` once the edit ends. */
  onFilter: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function TextField(props: TextFieldProps): JSX.Element {
  const fieldDefault = () => wireDefault(props.field.defaultValue);
  // A Text field has no name: its Default is how it is recognised, and the
  // position is all that is left to call it when that Default is blank.
  const label = () => props.field.defaultValue || `Text field ${props.position}`;
  /** The typed override alone — blank whenever the param is just carrying the Default. */
  const committed = () => textOverride(props.binding.value(), props.field.defaultValue) ?? '';

  const [draft, setDraft] = createSignal(committed());
  let fieldRef!: HTMLTextAreaElement;
  let editing: TextFieldBinding | undefined;

  createEffect(() => {
    const value = committed();
    if (document.activeElement !== fieldRef) setDraft(value);
  });

  function write(text: string): boolean {
    const wire = text.trim() ? escapeNewlines(text) : fieldDefault();
    if (wire === props.binding.value()) return false;
    props.binding.setValue(wire);
    return true;
  }

  function commit() {
    const text = draft();
    // Only a changed value reaches Recent: blur fires on every focus cycle, and
    // an untouched field must not keep bumping its own text back to the top.
    if (write(text) && text.trim()) props.commitRecent(text);
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
        disabled={props.binding.readonly()}
        aria-label={label()}
        placeholder={props.field.defaultValue}
        onInput={(event) => {
          setDraft(event.currentTarget.value);
          props.onFilter(event.currentTarget.value);
        }}
        onFocus={() => {
          editing = props.binding;
          editing.beginEdit();
          props.onFocus();
        }}
        onBlur={() => {
          commit();
          editing?.endEdit();
          editing = undefined;
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
          props.commitRecent(payload.phrase);
        }}
      />
    </div>
  );
}
