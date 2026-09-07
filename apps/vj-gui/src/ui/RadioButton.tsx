import type { JSX } from 'solid-js';
import { useRadioGroupName } from './RadioGroup';
import styles from './RadioButton.module.css';

export interface RadioButtonProps {
  /** Only for a radio outside a RadioGroup; inside one, the group names it. */
  name?: string;
  checked: boolean;
  highlighted?: boolean;
  onSelect: () => void;
  children: JSX.Element;
}

export function RadioButton(props: RadioButtonProps): JSX.Element {
  const groupName = useRadioGroupName();
  return (
    <label
      class={`${styles.button} ${props.checked ? styles.checked : ''}`}
      data-highlighted={props.highlighted}
    >
      <input
        type="radio"
        class="u-sr-only"
        name={props.name ?? groupName?.()}
        checked={props.checked}
        onChange={() => props.onSelect()}
      />
      {props.children}
    </label>
  );
}
