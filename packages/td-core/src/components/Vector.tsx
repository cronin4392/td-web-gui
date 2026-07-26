/**
 * `<Vector>` — a group of numeric inputs bound to a non-color multi-component
 * `number[]` ParGroup (XYZ position, UV, size, …). This is the
 * generic case of the array wire shape: `<Color>` is its color-specialized
 * sibling and `<NumberInput>` the single-component scalar case.
 *
 * `length` (or `labels`, whose length wins if both are given) sets the
 * component count. Each sub-input holds the same invalid/empty rules as
 * `<NumberInput>` — hold last valid while empty/unparseable, never send NaN,
 * clamp to `min`/`max`, snap back on blur — but writes back into the *whole*
 * array as one `update` (throttled by default, like a drag), since the wire
 * shape has no notion of a single component in isolation. Editing any one
 * sub-input marks the *whole* binding as being edited, suppressing TD echoes
 * for every component until that input blurs — the shared-signal model,
 * applied here within a single param.
 */

import { createEffect, Index, splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'

export interface VectorProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** TD parameter name to bind. */
  name: string
  /** Component count. Ignored if `labels` is given. Default 3. */
  length?: number
  /** Per-component labels (also sets the count); default `['0', '1', ...]`. */
  labels?: string[]
  min?: number
  max?: number
  step?: number | string
  /** rAF-coalesce outbound sends. Default `true`. */
  throttle?: boolean
}

export function Vector(props: VectorProps): JSX.Element {
  const binding = createTDSignal<number[]>(props.name)
  const [, rest] = splitProps(props, [
    'name',
    'length',
    'labels',
    'min',
    'max',
    'step',
    'throttle',
  ])

  const labels = (): string[] =>
    props.labels ?? Array.from({ length: props.length ?? 3 }, (_, i) => String(i))

  const clamp = (n: number): number => {
    let out = n
    if (props.min !== undefined) out = Math.max(props.min, out)
    if (props.max !== undefined) out = Math.min(props.max, out)
    return out
  }

  const refs: (HTMLInputElement | undefined)[] = []

  // Reflect TD-side changes into each field, but never while it's being edited.
  createEffect(() => {
    const value = binding.value()
    labels().forEach((_, index) => {
      const el = refs[index]
      if (el && document.activeElement !== el) {
        el.value = value?.[index] === undefined ? '' : String(value[index])
      }
    })
  })

  function commit(index: number, parsed: number) {
    const current = binding.value() ?? labels().map(() => 0)
    const next = current.slice()
    next[index] = clamp(parsed)
    binding.setValue(next, { throttle: props.throttle !== false })
  }

  return (
    <div class="td-vector" {...rest}>
      {/* Fixed positional slots, not identity-keyed items, so <Index> (not
          <For>) is the right list primitive here — it keys by position, which
          also sidesteps any collision if two labels happen to share text. */}
      <Index each={labels()}>
        {(label, index) => (
          <input
            ref={(el) => (refs[index] = el)}
            type="number"
            class="td-vector-input"
            min={props.min}
            max={props.max}
            step={props.step}
            aria-label={label()}
            disabled={binding.readonly()}
            onInput={(event) => {
              const raw = event.currentTarget.value
              if (raw.trim() === '') return // hold last valid, send nothing
              const parsed = Number(raw)
              if (Number.isNaN(parsed)) return // never send NaN
              commit(index, parsed)
            }}
            onFocus={() => binding.beginEdit()}
            onBlur={(event) => {
              binding.endEdit()
              // Snap the display back to the signal's current (last valid) value.
              const value = binding.value()
              event.currentTarget.value = value?.[index] === undefined ? '' : String(value[index])
            }}
          />
        )}
      </Index>
    </div>
  )
}
