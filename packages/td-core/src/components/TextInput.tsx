/**
 * `<TextInput>` — text input bound to a TD string parameter (Phase 2.4;
 * `commitOn` added for the text-selector app, see TEXT_SELECTOR.md §6;
 * `multiline` likewise).
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
 *
 * **`multiline`** — renders a `<textarea>` and translates line breaks at the
 * wire boundary: what the user types and sees has real newlines, what the bound
 * signal (and TD) holds has the two-character `\n` escape (see
 * {@link escapeNewlines}). Enter still commits and **Shift+Enter inserts a line
 * break**; a textarea has no implicit form submission, so under
 * `commitOn="enter"` the Enter keydown path is the commit path here even inside
 * a `<form>`.
 *
 * Like `name` and `commitOn`, `multiline` is fixed at setup; remount to change
 * it.
 */

import { createEffect, createSignal, onCleanup, onMount, splitProps, type JSX } from 'solid-js'
import { createTDSignal } from '../context'
import { escapeNewlines, unescapeNewlines } from '../wire'

/** Either element this component renders; both carry `.form` and `.value`. */
type TextFieldElement = HTMLInputElement | HTMLTextAreaElement

export interface TextInputProps
  extends Omit<JSX.InputHTMLAttributes<TextFieldElement>, 'name' | 'value' | 'type'> {
  /** TD parameter name to bind. */
  name: string
  /** When the local value is written to the bound signal and sent to TD. Default: 'input'. */
  commitOn?: 'input' | 'enter'
  /**
   * Render a `<textarea>`, carrying line breaks to TD as the `\n` escape. Read
   * once at setup (like {@link TextInputProps.name}); remount to change it.
   */
  multiline?: boolean
  /** Visible rows; `multiline` only. */
  rows?: number
  /** Fired on each committed value (including via form submit / blur), with real newlines. */
  onCommit?: (value: string) => void
}

export function TextInput(props: TextInputProps): JSX.Element {
  const binding = createTDSignal<string>(props.name)
  const [, rest] = splitProps(props, [
    'name',
    'commitOn',
    'multiline',
    'disabled',
    'onCommit',
    'onInput',
    'onFocus',
    'onBlur',
    'onKeyDown',
    // Split out (not spread) because the element is a union here: a `ref` typed
    // for both would satisfy neither branch. `setRef` forwards it instead.
    'ref',
    // Split out so it can't reach an <input>, where `rows` is not a valid
    // attribute; the textarea branches apply it explicitly.
    'rows',
  ])

  const multiline = props.multiline ?? false
  const commitOn = props.commitOn ?? 'input'

  /** Wire value (TD's escapes) → what the user sees and edits. */
  const toField = (wire: string) => (multiline ? unescapeNewlines(wire) : wire)
  /** Edited text → wire value. */
  const toWire = (text: string) => (multiline ? escapeNewlines(text) : text)

  let fieldRef!: TextFieldElement
  /** Keep the local handle to the element, and pass it on to a consumer `ref`. */
  const setRef = (el: TextFieldElement) => {
    fieldRef = el
    const forward = props.ref
    if (typeof forward === 'function') (forward as (el: TextFieldElement) => void)(el)
  }

  if (commitOn === 'input') {
    const value = () => toField(binding.value() ?? '')
    const handleInput = (event: { currentTarget: TextFieldElement }) => {
      const text = event.currentTarget.value
      binding.setValue(toWire(text))
      props.onCommit?.(text)
      callHandler(props.onInput, event as unknown as Event)
    }
    const handleFocus = (event: Event) => {
      binding.beginEdit()
      callHandler(props.onFocus, event)
    }
    const handleBlur = (event: Event) => {
      binding.endEdit()
      callHandler(props.onBlur, event)
    }

    return multiline ? (
      <textarea
        ref={setRef}
        class="td-text-input"
        {...rest}
        rows={props.rows}
        value={value()}
        disabled={props.disabled ?? binding.readonly()}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    ) : (
      <input
        ref={setRef}
        type="text"
        class="td-text-input"
        {...rest}
        value={value()}
        disabled={props.disabled ?? binding.readonly()}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    )
  }

  // commitOn="enter" — local draft; commit on form submit / Enter / blur;
  // Escape reverts silently.
  const [draft, setDraft] = createSignal(toField(binding.value() ?? ''))

  // Reflect TD-side / programmatic changes into the draft. Safe even without
  // the focus guard — echo suppression means `binding.value()` cannot change
  // while this input is focused — but the guard is kept for defense-in-depth.
  createEffect(() => {
    const value = toField(binding.value() ?? '')
    if (document.activeElement !== fieldRef) setDraft(value)
  })

  function commit() {
    const value = toWire(draft())
    if (value === (binding.value() ?? '')) return // unchanged — no-op
    binding.setValue(value)
    props.onCommit?.(draft())
  }

  onMount(() => {
    const form = fieldRef.form
    if (!form) return
    const handleSubmit = (event: Event) => {
      event.preventDefault()
      commit()
    }
    form.addEventListener('submit', handleSubmit)
    onCleanup(() => form.removeEventListener('submit', handleSubmit))
  })

  const handleInput = (event: { currentTarget: TextFieldElement }) => {
    setDraft(event.currentTarget.value)
    callHandler(props.onInput, event as unknown as Event)
  }
  const handleFocus = (event: Event) => {
    binding.beginEdit()
    callHandler(props.onFocus, event)
  }
  const handleBlur = (event: Event) => {
    commit()
    binding.endEdit()
    callHandler(props.onBlur, event)
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setDraft(toField(binding.value() ?? ''))
    } else if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
      // Multiline always commits from here — a textarea raises no implicit
      // `submit`, and Shift+Enter (excluded above) is its line break.
      // Single-line only commits here when there's no form to raise `submit`.
      if (multiline || !fieldRef.form) {
        event.preventDefault()
        commit()
      }
    }
    callHandler(props.onKeyDown, event)
  }

  return multiline ? (
    <textarea
      ref={setRef}
      class="td-text-input"
      {...rest}
      rows={props.rows}
      value={draft()}
      disabled={props.disabled ?? binding.readonly()}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  ) : (
    <input
      ref={setRef}
      type="text"
      class="td-text-input"
      {...rest}
      value={draft()}
      disabled={props.disabled ?? binding.readonly()}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
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
