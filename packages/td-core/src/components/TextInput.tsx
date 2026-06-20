/**
 * `<TextInput>` — text input bound to a TD string parameter (Phase 2.4).
 *
 * Optimistic local write + send-on-change: each keystroke updates the shared
 * signal immediately and sends an `update`, so the UI never waits a round-trip.
 * Focus drives echo suppression (Phase 2.5) — while focused, TD's echo of the
 * just-sent value (and any other inbound update for this param) is ignored, so
 * the value/cursor never jumps out from under the user.
 */

import { splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'

export interface TextInputProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'type'> {
  /** TD parameter name to bind. */
  name: string
}

export function TextInput(props: TextInputProps): JSX.Element {
  const binding = createTDSignal<string>(props.name)
  const [, rest] = splitProps(props, ['name', 'onInput', 'onFocus', 'onBlur'])

  return (
    <input
      type="text"
      class="td-text-input"
      {...rest}
      value={binding.value() ?? ''}
      onInput={(event) => {
        binding.setValue(event.currentTarget.value)
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

/**
 * Invoke a Solid event handler prop (plain function or `[handler, data]` bound
 * tuple), if the consumer passed one. Loosely typed because Solid's per-element
 * handler unions don't unify across a generic call site.
 */
export function callHandler(handler: unknown, event: Event): void {
  if (!handler) return
  if (typeof handler === 'function') (handler as (e: Event) => void)(event)
  else if (Array.isArray(handler)) {
    ;(handler[0] as (data: unknown, e: Event) => void)(handler[1], event)
  }
}
