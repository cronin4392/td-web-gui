import type { JSX } from 'solid-js';
import styles from './RadioButton.module.css';

export interface RadioButtonProps {
  /** Shared across the group — this is what makes arrow-key navigation work. */
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: JSX.Element;
}

export function RadioButton(props: RadioButtonProps): JSX.Element {
  return (
    <label class={`${styles.button} ${props.checked ? styles.checked : ''}`}>
      <input
        type="radio"
        class="u-sr-only"
        name={props.name}
        checked={props.checked}
        onChange={() => props.onSelect()}
      />
      {props.children}
    </label>
  );
}
