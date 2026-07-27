/**
 * `<Value>` — read-only readout of a TD parameter.
 *
 * Subscribes to inbound updates only; never sends and never participates in
 * focus/echo logic. Works for scalars and arrays, with an optional `format`
 * function for display (fixed decimals, units, etc.).
 */

import { splitProps, type JSX } from 'solid-js';
import { createTDSignal } from '../context';
import type { ParamValue } from '../wire';

export interface ValueProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** TD parameter name to read. */
  name: string;
  /** Optional display formatter; receives the raw value. */
  format?: (value: ParamValue) => string;
}

export function Value(props: ValueProps): JSX.Element {
  const binding = createTDSignal(props.name);
  const [, rest] = splitProps(props, ['name', 'format']);

  const display = (): string => {
    const value = binding.value();
    if (value === undefined) return '';
    if (props.format) return props.format(value);
    if (!Array.isArray(value)) return String(value);
    // A table readout (`string[][]`) joins cells within a row and rows with a
    // separator, so a one-line readout of one stays legible instead of
    // collapsing into an ambiguous run of commas. `<Table>` is the real
    // component for these; this is the sensible degradation, not the intent.
    return value
      .map((entry) => (Array.isArray(entry) ? entry.join(', ') : String(entry)))
      .join(Array.isArray(value[0]) ? ' | ' : ', ');
  };

  return (
    <span class="td-value" {...rest}>
      {display()}
    </span>
  );
}
