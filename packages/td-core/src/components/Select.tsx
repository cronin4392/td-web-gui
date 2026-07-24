/**
 * `<Select>` — dropdown bound to a TD Menu parameter (Phase 4.6).
 *
 * `options` is authored on the web side as `{ value, label }[]` — consistent
 * with the no-introspection schema stance (see § "Type safety"). The wire
 * value is the menu's string **key**, matching `par.eval()` on a Menu par
 * (keys survive TD-side menu reordering where indices wouldn't). If TD's menu
 * keys change, keeping `options` in sync is the app's responsibility, same as
 * the typed param schema itself.
 */

import { For, splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import { callHandler } from './TextInput'

export interface SelectOption {
  /** Wire value — the TD menu's string key. */
  value: string
  /** Display label. */
  label: string
}

export interface SelectProps
  extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'value' | 'children'> {
  /** TD parameter name to bind. */
  name: string
  /** Web-authored menu options; wire value is `option.value` (the menu key). */
  options: SelectOption[]
}

export function Select(props: SelectProps): JSX.Element {
  const binding = createTDSignal<string>(props.name)
  const [, rest] = splitProps(props, ['name', 'options', 'disabled', 'onChange', 'onFocus', 'onBlur'])

  return (
    <select
      class="td-select"
      {...rest}
      value={binding.value() ?? ''}
      disabled={props.disabled ?? binding.readonly()}
      onChange={(event) => {
        binding.setValue(event.currentTarget.value)
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
    >
      <For each={props.options}>
        {(option) => <option value={option.value}>{option.label}</option>}
      </For>
    </select>
  )
}
