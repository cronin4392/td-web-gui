/**
 * `<Select>` — dropdown bound to a TD Menu parameter (Phase 4.6).
 *
 * The wire value is the menu's string **key**, matching `par.eval()` on a Menu
 * par (keys survive TD-side menu reordering where indices wouldn't).
 *
 * Options come from one of two places, in this order:
 *
 * 1. **The `options` prop** — web-authored `{ value, label }[]`, the default and
 *    the no-introspection stance (see § "Type safety"). Keeping it in sync with
 *    TD's menu is the app's responsibility, same as the typed schema itself.
 * 2. **TD's announced menu** (Phase 6.2) — used when `options` is omitted. Some
 *    menus genuinely cannot be authored ahead of time: an audio-device list
 *    depends on the machine TD runs on and changes when hardware is plugged in.
 *    For those, TD announces the options over the `menus` message and the
 *    dropdown builds itself.
 *
 * The prop wins when both exist, so adding announcements to a project can never
 * change what an existing web-authored `<Select>` renders.
 */

import { createMemo, For, splitProps, type JSX } from 'solid-js'
import { createTDSignal, useTDConnection } from '../context'
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
  /**
   * Web-authored menu options; wire value is `option.value` (the menu key).
   * Omit to use the options TD announces for this param (Phase 6.2) — required
   * for menus whose contents only TD knows.
   */
  options?: SelectOption[]
}

export function Select(props: SelectProps): JSX.Element {
  const binding = createTDSignal<string>(props.name)
  const connection = useTDConnection()
  const [, rest] = splitProps(props, ['name', 'options', 'disabled', 'onChange', 'onFocus', 'onBlur'])

  const announced = () => props.options ?? connection.menuOptions(props.name) ?? []

  /**
   * TD's current value with no matching option — a device unplugged since it was
   * selected, or web-authored `options` that have drifted from TD's menu.
   *
   * Rendered as a disabled entry rather than dropped, because a `<select>` asked
   * to hold a value it doesn't have simply displays a *different* option, which
   * misreports TD's actual state as though the user had chosen it.
   */
  const orphan = createMemo(() => {
    const current = binding.value()
    if (!current || announced().some((o) => o.value === current)) return undefined
    return { value: current, label: `${current} (unavailable)`, unavailable: true }
  })

  const options = createMemo<(SelectOption & { unavailable?: boolean })[]>(() => {
    const missing = orphan()
    return missing ? [missing, ...announced()] : announced()
  })

  return (
    <select
      class="td-select"
      {...rest}
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
      {/* Selection is bound per-option rather than as `value` on the <select>.
          <For> recycles option elements in place, so when the list changes the
          browser keeps the selected *index* while the values shift underneath —
          silently showing a neighbouring device as selected. Marking the right
          option `selected` follows the data instead of the position. */}
      <For each={options()}>
        {(option) => (
          <option
            value={option.value}
            disabled={option.unavailable}
            selected={option.value === binding.value()}
          >
            {option.label}
          </option>
        )}
      </For>
    </select>
  )
}
