/**
 * A ramp TouchDesigner sampled for us, as a CSS gradient.
 *
 * TD walks its own Color scheme COMPs and reduces each one's ramp to a handful
 * of `[pos, r, g, b, a]` stops (`_ramp_stops` in `td/gui-config.py`), so
 * everything a Ramp TOP models — phase, period, interpolation, the ramp's own
 * shape — has already been applied by the time a row gets here. Nothing in this
 * file talks to TouchDesigner; it turns what arrived into a `background-image`.
 *
 * That sampling is also what lets a scheme built from something other than one
 * Ramp TOP be drawn at all, which most of them are.
 */

/** One color keyframe. */
export interface RampKey {
  pos: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A row describing one key: `pos, r, g, b, a`. Numbers as TD sends them;
 * strings are accepted too, since a row read straight off a DAT is text. */
export type RampRow = readonly (string | number)[];

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Rows as color keys, skipping anything that isn't one. A header row fails the
 * numeric parse and drops out on that alone, so a table reads the same whether
 * or not it has one.
 */
export function rampKeys(table: readonly RampRow[] | undefined): RampKey[] {
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
 * `<color> <offset>` pairs for the gradient, in ascending offset order.
 *
 * Sorted rather than trusted: CSS clamps each out-of-order stop up to its
 * predecessor, which would collapse a ramp listed backwards into one hard edge.
 */
function gradientStops(keys: RampKey[]): string[] {
  const entries = keys
    .map((key) => ({ offset: key.pos, color: cssColor(key) }))
    .sort((a, b) => a.offset - b.offset);

  if (entries.length === 0) return [];
  // A single stop isn't a legal gradient, and a lone key is a flat fill.
  if (entries.length === 1) return [`${entries[0]!.color} 0%`, `${entries[0]!.color} 100%`];

  return entries.map((entry) => `${entry.color} ${percent(entry.offset)}`);
}

/**
 * The `background-image` for a sampled ramp, or `undefined` when there is
 * nothing to draw — before the catalog lands, and for a scheme whose ramp held
 * no usable rows.
 */
export function colorStopsGradient(stops: readonly RampRow[] | undefined): string | undefined {
  const entries = gradientStops(rampKeys(stops));
  if (entries.length === 0) return undefined;
  return `linear-gradient(to right, ${entries.join(', ')})`;
}
