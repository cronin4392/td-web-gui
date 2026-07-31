/**
 * `<Color>` — color-specialized sibling of `<Vector>`, bound to a `[r,g,b]` /
 * `[r,g,b,a]` array parameter of 0–1 floats matching TD's color pars. Renders a
 * native `<input type="color">` (hex, 0–255 per channel) for RGB plus, when
 * `alpha` is set, a separate 0–1 range slider — the color input has no native
 * alpha channel. Throttled by default while dragging, like
 * `<RangeInput>`/`<Vector>`.
 */

import { Show, splitProps, type JSX } from 'solid-js';
import { createTDSignal } from '../context';
import { mergeClass } from './props';

export interface ColorProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** TD parameter name to bind. */
  name: string;
  /** Render a fourth (alpha) channel; wire array becomes `[r,g,b,a]`. Default `false`. */
  alpha?: boolean;
  /** rAF-coalesce outbound sends. Default `true`. */
  throttle?: boolean;
  /** Disable both inputs. Defaults to the binding's read-only state. */
  disabled?: boolean;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function toByte(n: number): string {
  return Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0');
}

function toHex(rgb: number[]): string {
  return `#${toByte(rgb[0] ?? 0)}${toByte(rgb[1] ?? 0)}${toByte(rgb[2] ?? 0)}`;
}

function fromHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function Color(props: ColorProps): JSX.Element {
  const binding = createTDSignal<number[]>(props.name);
  const [, rest] = splitProps(props, ['name', 'alpha', 'throttle', 'class', 'disabled']);

  const alpha = () => props.alpha ?? false;
  const throttleOpt = () => props.throttle !== false;
  const current = (): number[] => binding.value() ?? [0, 0, 0, ...(alpha() ? [1] : [])];

  return (
    <div {...rest} class={mergeClass('td-color', props.class)}>
      <input
        type="color"
        class="td-color-rgb"
        value={toHex(current())}
        disabled={props.disabled ?? binding.readonly()}
        onInput={(event) => {
          const [r, g, b] = fromHex(event.currentTarget.value);
          const next = current().slice();
          next[0] = r;
          next[1] = g;
          next[2] = b;
          binding.setValue(next, { throttle: throttleOpt() });
        }}
        onFocus={() => binding.beginEdit()}
        onBlur={() => binding.endEdit()}
      />
      <Show when={alpha()}>
        <input
          type="range"
          class="td-color-alpha"
          min={0}
          max={1}
          step={0.01}
          value={current()[3] ?? 1}
          disabled={props.disabled ?? binding.readonly()}
          onInput={(event) => {
            const next = current().slice();
            next[3] = Number(event.currentTarget.value);
            binding.setValue(next, { throttle: throttleOpt() });
          }}
          onFocus={() => binding.beginEdit()}
          onBlur={() => binding.endEdit()}
        />
      </Show>
    </div>
  );
}
