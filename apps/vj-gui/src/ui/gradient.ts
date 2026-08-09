/**
 * A TouchDesigner Ramp TOP as a CSS gradient.
 *
 * The Ramp TOP holds its color keyframes in the DAT its `dat` par names — one
 * row per key, columns `pos, r, g, b, a`, all 0–1 — and positions them along the
 * axis with `phase` (where the ramp starts) and `period` (how long it runs).
 * Those are ordinary readouts and params on the wire, so nothing here talks to
 * TouchDesigner; it turns what arrived into a `background-image`.
 *
 * What is and isn't modelled:
 *
 *  - **Vertical and horizontal** ramps render as `linear-gradient`. `radial` and
 *    `circular` fall back to horizontal — the color sequence is right, the
 *    geometry isn't — until there's a reason to build them.
 *  - **`phase` and `period`** map straight onto stop offsets, and TD's default
 *    `Hold` extend then comes free: CSS holds the first and last stop colors
 *    past the ends of the gradient exactly as the Ramp TOP does. The other four
 *    extend modes (Black, Zero, Repeat, Mirror) are not modelled.
 *  - **`step` and `linear`** interpolation are exact. `easeineaseout` and
 *    `hermite` render as linear, since a CSS gradient interpolates linearly
 *    between stops and nothing here samples the curve.
 */

/** One color keyframe, straight off a row of the Ramp TOP's DAT. */
export interface RampKey {
  pos: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The Ramp TOP's `type` menu keys. */
export type RampType = 'vertical' | 'horizontal' | 'radial' | 'circular';

/** The Ramp TOP's `interp` menu keys. */
export type RampInterp = 'step' | 'linear' | 'easeineaseout' | 'hermite';

/** Everything the gradient is built from. Each field is one wire name. */
export interface RampSource {
  keys: string[][] | undefined;
  type?: string;
  phase?: number;
  period?: number;
  interp?: string;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Rows of the Ramp TOP's DAT as color keys, skipping anything that isn't one.
 * A header row fails the numeric parse and drops out on that alone, so the DAT
 * reads the same whether or not it has one.
 */
export function rampKeys(table: string[][] | undefined): RampKey[] {
  const keys: RampKey[] = [];
  for (const row of table ?? []) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [pos, r, g, b, a] = row.slice(0, 5).map(Number);
    if (![pos, r, g, b, a].every((n) => Number.isFinite(n))) continue;
    keys.push({
      pos: pos!,
      r: clamp01(r!),
      g: clamp01(g!),
      b: clamp01(b!),
      a: clamp01(a!),
    });
  }
  return keys;
}

function cssColor(key: RampKey): string {
  const channel = (value: number) => Math.round(value * 255);
  return `rgb(${channel(key.r)} ${channel(key.g)} ${channel(key.b)} / ${key.a})`;
}

/** Trailing zeroes off, so a stop reads `50%` rather than `50.0000%`. */
function percent(offset: number): string {
  return `${Number((offset * 100).toFixed(4))}%`;
}

/**
 * Where a key lands on screen. TD samples the ramp at `(u - phase) / period`,
 * so a key at `pos` shows up at `phase + pos * period`. Offsets outside 0–1 are
 * left alone: CSS accepts them and holds the end colors past the edges, which
 * is the Ramp TOP's default extend.
 */
function offsetOf(key: RampKey, phase: number, period: number): number {
  return phase + key.pos * period;
}

/**
 * `<color> <offset>` pairs for the gradient, in ascending offset order.
 *
 * Sorted rather than trusted: the DAT's row order is the author's, and a
 * negative `period` reverses the ramp. CSS would otherwise clamp each
 * out-of-order stop up to its predecessor and collapse the whole thing into one
 * hard edge.
 */
function gradientStops(keys: RampKey[], phase: number, period: number, step: boolean): string[] {
  const entries = keys
    .map((key) => ({ offset: offsetOf(key, phase, period), color: cssColor(key) }))
    .sort((a, b) => a.offset - b.offset);

  if (entries.length === 0) return [];
  if (entries.length === 1) {
    // A single stop isn't a legal gradient, and a lone key is a flat fill.
    return [`${entries[0]!.color} 0%`, `${entries[0]!.color} 100%`];
  }

  const stops: string[] = [];
  entries.forEach((entry, index) => {
    stops.push(`${entry.color} ${percent(entry.offset)}`);
    // Step holds each color until the next key, so it needs a second stop at
    // the following offset to make the transition a hard edge.
    const next = entries[index + 1];
    if (step && next) stops.push(`${entry.color} ${percent(next.offset)}`);
  });
  return stops;
}

/**
 * The `background-image` for a ramp, or `undefined` when there is nothing to
 * draw — before TD's first snapshot, or for a DAT holding no usable rows.
 */
export function rampGradient(ramp: RampSource): string | undefined {
  const keys = rampKeys(ramp.keys);
  const phase = Number.isFinite(ramp.phase) ? ramp.phase! : 0;
  const period = Number.isFinite(ramp.period) ? ramp.period! : 1;
  const stops = gradientStops(keys, phase, period, ramp.interp === 'step');
  if (stops.length === 0) return undefined;

  const joined = stops.join(', ');
  switch (ramp.type) {
    case 'vertical':
      // `to top`, not `to bottom`: TD's texture origin is bottom-left with Y
      // increasing upward, so the ramp's position 0 is the bottom edge.
      return `linear-gradient(to top, ${joined})`;
    // Not modelled yet: these render as a horizontal ramp, which gets the
    // colors right and the shape wrong.
    case 'radial':
    case 'circular':
    case 'horizontal':
    default:
      return `linear-gradient(to right, ${joined})`;
  }
}
