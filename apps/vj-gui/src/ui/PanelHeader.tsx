import { Show, type JSX } from 'solid-js';
import styles from './PanelHeader.module.css';

export function PanelHeader(props: {
  title: string;
  class?: string;
  children?: JSX.Element;
}): JSX.Element {
  return (
    <header class={[styles.header, props.class].filter(Boolean).join(' ')}>
      <h2 class={styles.title}>{props.title}</h2>
      <Show when={props.children}>
        <div class={styles.actions}>{props.children}</div>
      </Show>
    </header>
  );
}

export function PanelHeaderButton(props: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      class={styles.button}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}
