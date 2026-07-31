/**
 * `<Button mode="pulse|hold|toggle">` — three distinct wire behaviors sharing
 * one rendered `<button>`.
 *
 * **`mode="pulse"`** (default) — fires a TD **pulse** (momentary) parameter.
 * Pulses are fire-and-forget events, not values: each click sends a dedicated
 * `pulse` message (via `connection.pulse`, not `createTDSignal`), the component
 * holds no synced state, and it's web → TD only — excluded from snapshot/echo
 * logic entirely. One pulse per activation, never throttled.
 *
 * **`mode="hold"`** — momentary bool: `true` on press, `false` on release.
 * Ordinary bidirectional bool `update`, so it reflects TD-side changes and
 * participates in resync like any other control. Three things keep the bool from
 * getting stranded `true`:
 *  - **Pointer capture.** `setPointerCapture` on `pointerdown` so `pointerup`
 *    still arrives after the cursor drags off the element; `pointercancel`,
 *    `lostpointercapture`, and a window `blur` while held all release too (the
 *    "OS stole focus mid-press" cases a bare `pointerleave` would miss).
 *  - **Keyboard.** Space/Enter keydown → press, keyup → release, with the
 *    browser's key-repeat suppressed (`event.repeat`) so a held key doesn't
 *    re-fire `true` on every repeat tick.
 *  - **Unmount.** Releasing on cleanup, since a button removed mid-press fires
 *    neither `pointerup` nor `blur`.
 *
 * **`mode="toggle"`** — same wire path as `<Toggle>` (bool `update`,
 * bidirectional), just rendered as a button: each click flips the value.
 *
 * Only `pulse` bypasses `createTDSignal`; `hold`/`toggle` disable (and dev-warn)
 * on a read-only param the same as every other bound control — `pulse` has no
 * synced value to protect, so it isn't guarded the same way.
 *
 * Each mode is its own component so `splitProps` only ever removes the handlers
 * that mode actually intercepts. One shared split had to name the union of all
 * three, which silently swallowed `disabled` on `pulse` and dropped every
 * pointer/keyboard handler passed to a mode that didn't use it.
 */

import { onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { createTDSignal, useTDConnection } from '../context';
import { callHandler, mergeClass } from './props';

export interface ButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'name' | 'type'
> {
  /** TD parameter name to bind (pulse param for `mode="pulse"`, bool otherwise). */
  name: string;
  /**
   * Default `'pulse'`. Read once at setup (like `commitOn`/`multiline` on
   * `<TextInput>`); remount to change it.
   */
  mode?: 'pulse' | 'hold' | 'toggle';
}

export function Button(props: ButtonProps): JSX.Element {
  switch (props.mode ?? 'pulse') {
    case 'hold':
      return HoldButton(props);
    case 'toggle':
      return ToggleButton(props);
    default:
      return PulseButton(props);
  }
}

function PulseButton(props: ButtonProps): JSX.Element {
  const connection = useTDConnection();
  const [, rest] = splitProps(props, ['name', 'mode', 'class', 'onClick']);

  return (
    <button
      type="button"
      {...rest}
      class={mergeClass('td-button td-button-pulse', props.class)}
      onClick={(event) => {
        connection.pulse(props.name);
        callHandler(props.onClick, event);
      }}
    >
      {props.children}
    </button>
  );
}

function ToggleButton(props: ButtonProps): JSX.Element {
  const binding = createTDSignal<boolean>(props.name);
  const [, rest] = splitProps(props, ['name', 'mode', 'class', 'disabled', 'onClick']);

  return (
    <button
      type="button"
      aria-pressed={binding.value() ?? false}
      {...rest}
      class={mergeClass('td-button td-button-toggle', props.class)}
      disabled={props.disabled ?? binding.readonly()}
      onClick={(event) => {
        binding.setValue(!(binding.value() ?? false));
        callHandler(props.onClick, event);
      }}
    >
      {props.children}
    </button>
  );
}

function HoldButton(props: ButtonProps): JSX.Element {
  const binding = createTDSignal<boolean>(props.name);
  const [, rest] = splitProps(props, [
    'name',
    'mode',
    'class',
    'disabled',
    'onPointerDown',
    'onPointerUp',
    'onPointerCancel',
    'onLostPointerCapture',
    'onKeyDown',
    'onKeyUp',
  ]);

  let isPressed = false;

  function press() {
    if (isPressed) return;
    isPressed = true;
    binding.beginEdit();
    binding.setValue(true);
  }
  function release() {
    if (!isPressed) return;
    isPressed = false;
    binding.endEdit();
    binding.setValue(false);
  }

  onMount(() => {
    const handleWindowBlur = () => release();
    window.addEventListener('blur', handleWindowBlur);
    onCleanup(() => window.removeEventListener('blur', handleWindowBlur));
  });
  onCleanup(release);

  return (
    <button
      type="button"
      aria-pressed={binding.value() ?? false}
      {...rest}
      class={mergeClass('td-button td-button-hold', props.class)}
      disabled={props.disabled ?? binding.readonly()}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
        callHandler(props.onPointerDown, event);
      }}
      onPointerUp={(event) => {
        release();
        callHandler(props.onPointerUp, event);
      }}
      onPointerCancel={(event) => {
        release();
        callHandler(props.onPointerCancel, event);
      }}
      onLostPointerCapture={(event) => {
        release();
        callHandler(props.onLostPointerCapture, event);
      }}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          press();
        }
        callHandler(props.onKeyDown, event);
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') release();
        callHandler(props.onKeyUp, event);
      }}
    >
      {props.children}
    </button>
  );
}
