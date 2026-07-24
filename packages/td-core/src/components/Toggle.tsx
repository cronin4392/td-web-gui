/**
 * `<Toggle>` — checkbox bound to a TD bool parameter (Phase 4.2).
 *
 * Same optimistic-write + send-on-change + focus-driven echo suppression as
 * the other controls; a checkbox is a discrete control, so unlike `<Range>`
 * there's no throttle. Disables (and dev-warns) when bound to a read-only
 * param — see § "Parameter modes" / Phase 4.10.
 */

import { splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import { callHandler } from './TextInput'

export interface ToggleProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'type' | 'checked'> {
  /** TD parameter name to bind. */
  name: string
}

export function Toggle(props: ToggleProps): JSX.Element {
  const binding = createTDSignal<boolean>(props.name)
  const [, rest] = splitProps(props, ['name', 'disabled', 'onChange', 'onFocus', 'onBlur'])

  return (
    <input
      type="checkbox"
      class="td-toggle"
      {...rest}
      checked={binding.value() ?? false}
      disabled={props.disabled ?? binding.readonly()}
      onChange={(event) => {
        binding.setValue(event.currentTarget.checked)
        callHandler(props.onChange, event)
      }}
      onFocus={(event) => {
        binding.beginEdit()
        callHandler(props.onFocus, event)
      }}
      onBlur={(event) => {
        binding.endEdit()
        callHandler(props.onBlur, event)
      }}
    />
  )
}
