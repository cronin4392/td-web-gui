import type { JSX } from 'solid-js';

export interface RadioButtonProps {
  /** Shared across the group — this is what makes arrow-key navigation work. */
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: JSX.Element;
}

export function RadioButton(props: RadioButtonProps): JSX.Element {
  return (
    <label
      // Keep this list static: a reactive `class` reassigns className wholesale,
      // wiping whatever `classList` toggled on.
      class={[
        'cursor-pointer select-none text-center font-mono',
        'border border-white px-1 py-1 text-xs',
        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white',
      ].join(' ')}
      classList={{
        'bg-white text-black': props.checked,
        'bg-black text-white': !props.checked,
      }}
    >
      <input
        type="radio"
        class="sr-only"
        name={props.name}
        checked={props.checked}
        onChange={() => props.onSelect()}
      />
      {props.children}
    </label>
  );
}
