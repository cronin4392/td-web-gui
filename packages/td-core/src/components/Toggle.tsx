/**
 * `<Toggle>` — checkbox bound to a TD bool parameter.
 *
 * Same optimistic-write + send-on-change + focus-driven echo suppression as the
 * other controls; a checkbox is a discrete control, so unlike `<RangeInput>`
 * there's no throttle. Disables (and dev-warns) when bound to a read-only param
 * — see docs/design-notes.md § "Parameter modes".
 */

import { splitProps, type JSX } from 'solid-js';
import { createTDSignal } from '../context';
import { callHandler, mergeClass } from './props';

export interface ToggleProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'value' | 'type' | 'checked'
> {
  /** TD parameter name to bind. */
  name: string;
}

export function Toggle(props: ToggleProps): JSX.Element {
  const binding = createTDSignal<boolean>(props.name);
  const [, rest] = splitProps(props, [
    'name',
    'class',
    'disabled',
    'onChange',
    'onFocus',
    'onBlur',
  ]);

  return (
    <input
      type="checkbox"
      {...rest}
      class={mergeClass('td-toggle', props.class)}
      checked={binding.value() ?? false}
      disabled={props.disabled ?? binding.readonly()}
      onChange={(event) => {
        binding.setValue(event.currentTarget.checked);
        callHandler(props.onChange, event);
      }}
      onFocus={(event) => {
        binding.beginEdit();
        callHandler(props.onFocus, event);
      }}
      onBlur={(event) => {
        binding.endEdit();
        callHandler(props.onBlur, event);
      }}
    />
  );
}
