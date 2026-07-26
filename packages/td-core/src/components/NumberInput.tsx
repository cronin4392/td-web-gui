/**
 * `<NumberInput>` — numeric input bound to a TD number parameter.
 *
 * Invalid/empty-input rules (see § "Invalid / empty numeric input"):
 *  - While the field is empty or unparseable, hold the last valid value in the
 *    signal and send nothing — TD keeps showing the last good value.
 *  - Never send `NaN`.
 *  - Clamp to `min`/`max` (when set) before sending.
 *  - On blur, if the field is empty/invalid, snap the display back to the
 *    signal's current value so the display and TD can't drift apart.
 *
 * The visible text is left uncontrolled while editing (we never overwrite the
 * DOM value mid-edit), so clamping affects only the optimistic signal write and
 * never fights the user's cursor. TD-side changes are reflected via a ref only
 * while the field is not the active element (echo suppression handles the rest).
 */

import { createEffect, splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import { callHandler } from './TextInput'

export interface NumberInputProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'type'> {
  /** TD parameter name to bind. */
  name: string
  min?: number
  max?: number
  step?: number | string
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const binding = createTDSignal<number>(props.name)
  const [, rest] = splitProps(props, [
    'name',
    'min',
    'max',
    'disabled',
    'onInput',
    'onFocus',
    'onBlur',
  ])

  let inputRef!: HTMLInputElement

  const clamp = (n: number): number => {
    let out = n
    if (props.min !== undefined) out = Math.max(props.min, out)
    if (props.max !== undefined) out = Math.min(props.max, out)
    return out
  }

  // Reflect TD-side changes into the field, but never while it's being edited.
  createEffect(() => {
    const value = binding.value()
    if (inputRef && document.activeElement !== inputRef) {
      inputRef.value = value === undefined ? '' : String(value)
    }
  })

  return (
    <input
      ref={inputRef}
      type="number"
      class="td-number-input"
      min={props.min}
      max={props.max}
      step={props.step}
      {...rest}
      disabled={props.disabled ?? binding.readonly()}
      onInput={(event) => {
        const raw = event.currentTarget.value
        // Empty or unparseable mid-edit: hold last valid value, send nothing.
        if (raw.trim() !== '') {
          const parsed = Number(raw)
          if (!Number.isNaN(parsed)) binding.setValue(clamp(parsed))
        }
        callHandler(props.onInput, event)
      }}
      onFocus={(event) => {
        binding.beginEdit()
        callHandler(props.onFocus, event)
      }}
      onBlur={(event) => {
        binding.endEdit()
        // Snap the display back to the signal's current (last valid) value.
        const value = binding.value()
        inputRef.value = value === undefined ? '' : String(value)
        callHandler(props.onBlur, event)
      }}
    />
  )
}
