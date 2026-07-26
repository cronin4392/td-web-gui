/**
 * `<Value>` — read-only readout of a TD parameter.
 *
 * Subscribes to inbound updates only; never sends and never participates in
 * focus/echo logic. Works for scalars and arrays, with an optional `format`
 * function for display (fixed decimals, units, etc.).
 */

import { splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import type { ParamValue } from '../wire'

export interface ValueProps
  extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** TD parameter name to read. */
  name: string
  /** Optional display formatter; receives the raw value. */
  format?: (value: ParamValue) => string
}

export function Value(props: ValueProps): JSX.Element {
  const binding = createTDSignal(props.name)
  const [, rest] = splitProps(props, ['name', 'format'])

  const display = (): string => {
    const value = binding.value()
    if (value === undefined) return ''
    if (props.format) return props.format(value)
    return Array.isArray(value) ? value.join(', ') : String(value)
  }

  return (
    <span class="td-value" {...rest}>
      {display()}
    </span>
  )
}
