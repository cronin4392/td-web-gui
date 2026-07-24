/**
 * `<RangeInput>` — range slider bound to a TD number parameter (Phase 2.4).
 *
 * Same optimistic local write + send-on-change + focus-driven echo suppression
 * as `<TextInput>`. Unlike `<NumberInput>`, a slider's value is always a valid
 * in-range number, so there's no empty/`NaN`/clamp handling — the browser keeps
 * it within `min`/`max`. The control stays fully controlled (`value={…}`) since,
 * unlike a text field, there's no cursor to fight while TD echoes flow in.
 *
 * A slider is a high-frequency control, so its wire sends are **throttled by
 * default** (Phase 3.4): the optimistic signal write is still immediate (the
 * thumb and any bound readout move without waiting), but the `update` messages
 * coalesce to one per animation frame. Pass `throttle={false}` to opt out (send
 * on every input event) for a low-frequency use.
 */

import { splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import { callHandler } from './TextInput'

export interface RangeInputProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'type'> {
  /** TD parameter name to bind. */
  name: string
  min?: number
  max?: number
  step?: number | string
  /** rAF-coalesce outbound sends. Default `true`. */
  throttle?: boolean
}

export function RangeInput(props: RangeInputProps): JSX.Element {
  const binding = createTDSignal<number>(props.name)
  const [, rest] = splitProps(props, [
    'name',
    'throttle',
    'disabled',
    'onInput',
    'onFocus',
    'onBlur',
  ])

  return (
    <input
      type="range"
      class="td-range-input"
      {...rest}
      value={binding.value() ?? props.min ?? 0}
      disabled={props.disabled ?? binding.readonly()}
      onInput={(event) => {
        binding.setValue(Number(event.currentTarget.value), {
          throttle: props.throttle !== false,
        })
        callHandler(props.onInput, event)
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
