import { createContext, useContext, type JSX } from 'solid-js';
import styles from './RadioGroup.module.css';

const NameContext = createContext<() => string>();

export function useRadioGroupName(): (() => string) | undefined {
  return useContext(NameContext);
}

export interface RadioGroupProps {
  /** Shared across the group — this is what makes arrow-key navigation work. */
  name: string;
  /** Which pair of corners the strip's end pills round. */
  direction: 'horizontal' | 'vertical';
  label: string;
  class?: string;
  children: JSX.Element;
}

export function RadioGroup(props: RadioGroupProps): JSX.Element {
  return (
    <NameContext.Provider value={() => props.name}>
      <fieldset
        class={[styles.group, props.class].filter(Boolean).join(' ')}
        data-direction={props.direction}
        aria-label={props.label}
      >
        {props.children}
      </fieldset>
    </NameContext.Provider>
  );
}
