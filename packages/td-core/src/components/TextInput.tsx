/**
 * `<TextInput>` — text input bound to a TD string parameter (Phase 2.4;
 * `commitOn` added for the text-selector app, see TEXT_SELECTOR.md §6).
 *
 * **`commitOn="input"` (default)** — optimistic local write + send-on-change:
 * each keystroke updates the shared signal immediately and sends an `update`,
 * so the UI never waits a round-trip. Focus drives echo suppression
 * (Phase 2.5) — while focused, TD's echo of the just-sent value (and any other
 * inbound update for this param) is ignored, so the value/cursor never jumps
 * out from under the user.
 *
 * **`commitOn="enter"`** — keystrokes touch only a local draft; the bound
 * signal (and the wire) only sees a value on commit:
 *  - The browser's implicit form submission (`el.form`'s `submit` event) is
 *    the primary commit path — `preventDefault()`s the native submit/reload
 *    and commits. With no ancestor form, an Enter `keydown` handler is the
 *    fallback (guarded on `event.isComposing` so an IME confirmation doesn't
 *    commit).
 *  - Blur always commits too.
 *  - Escape reverts the draft to the last committed value and sends nothing;
 *    because a commit is a no-op when the draft already equals the last
 *    committed value, a blur immediately after Escape can't re-send.
 *  - A commit equal to the last committed value is a no-op — no `update`, no
 *    `onCommit`.
 *  - Because echo suppression (Phase 2.5) keeps `binding.value()` pinned to
 *    the last committed value for as long as this input is focused, that
 *    accessor doubles as "last committed" with no separate signal needed.
 */

import { createEffect, createSignal, onCleanup, onMount, splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'

export interface TextInputProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'type'> {
  /** TD parameter name to bind. */
  name: string
  /** When the local value is written to the bound signal and sent to TD. Default: 'input'. */
  commitOn?: 'input' | 'enter'
  /** Fired on each committed value (including via form submit / blur). */
  onCommit?: (value: string) => void
}

export function TextInput(props: TextInputProps): JSX.Element {
  const binding = createTDSignal<string>(props.name)
  const [, rest] = splitProps(props, [
    'name',
    'commitOn',
    'onCommit',
    'onInput',
    'onFocus',
    'onBlur',
    'onKeyDown',
  ])

  if ((props.commitOn ?? 'input') === 'input') {
    return (
      <input
        type="text"
        class="td-text-input"
        {...rest}
        value={binding.value() ?? ''}
        onInput={(event) => {
          const value = event.currentTarget.value
          binding.setValue(value)
          props.onCommit?.(value)
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

  // commitOn="enter" — local draft; commit on form submit / Enter fallback /
  // blur; Escape reverts silently.
  let inputRef!: HTMLInputElement
  const [draft, setDraft] = createSignal(binding.value() ?? '')

  // Reflect TD-side / programmatic changes into the draft. Safe even without
  // the focus guard — echo suppression means `binding.value()` cannot change
  // while this input is focused — but the guard is kept for defense-in-depth.
  createEffect(() => {
    const value = binding.value() ?? ''
    if (document.activeElement !== inputRef) setDraft(value)
  })

  function commit() {
    const value = draft()
    if (value === (binding.value() ?? '')) return // unchanged — no-op
    binding.setValue(value)
    props.onCommit?.(value)
  }

  onMount(() => {
    const form = inputRef.form
    if (!form) return
    const handleSubmit = (event: Event) => {
      event.preventDefault()
      commit()
    }
    form.addEventListener('submit', handleSubmit)
    onCleanup(() => form.removeEventListener('submit', handleSubmit))
  })

  return (
    <input
      ref={inputRef}
      type="text"
      class="td-text-input"
      {...rest}
      value={draft()}
      onInput={(event) => {
        setDraft(event.currentTarget.value)
        callHandler(props.onInput, event)
      }}
      onFocus={(event) => {
        binding.beginEdit()
        callHandler(props.onFocus, event)
      }}
      onBlur={(event) => {
        commit()
        binding.endEdit()
        callHandler(props.onBlur, event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(binding.value() ?? '')
        } else if (event.key === 'Enter' && !inputRef.form && !event.isComposing) {
          event.preventDefault()
          commit()
        }
        callHandler(props.onKeyDown, event)
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
