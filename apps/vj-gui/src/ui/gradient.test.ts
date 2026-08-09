/**
 * The Ramp TOP → CSS gradient translation. What the DAT holds is the author's
 * table, not a validated structure, so parsing has to survive a header row,
 * short rows, and out-of-order keys; and TD's axis conventions have to survive
 * the trip into CSS, where `to bottom` means the opposite of what a vertical
 * ramp does in TouchDesigner.
 */

import { describe, expect, it } from 'vitest';
import { rampGradient, rampKeys } from './gradient';

/** Black at the start, white at the end — the Ramp TOP's own default. */
const BLACK_TO_WHITE = [
  ['0', '0', '0', '0', '1'],
  ['1', '1', '1', '1', '1'],
];

describe('rampKeys', () => {
  it('reads pos and rgba off each row', () => {
    expect(rampKeys([['0.5', '1', '0', '0', '0.25']])).toEqual([
      { pos: 0.5, r: 1, g: 0, b: 0, a: 0.25 },
    ]);
  });

  it('skips a header row without being told there is one', () => {
    // The Ramp TOP's DAT may or may not carry column names, and the config has
    // no way to say which — failing the numeric parse is the whole test.
    const keys = rampKeys([['pos', 'r', 'g', 'b', 'a'], ...BLACK_TO_WHITE]);
    expect(keys.map((k) => k.pos)).toEqual([0, 1]);
  });

  it('skips rows too short to be a keyframe', () => {
    expect(rampKeys([['0', '1', '1']])).toEqual([]);
  });

  it('ignores extra columns', () => {
    expect(rampKeys([['0', '1', '1', '1', '1', 'anything']])).toHaveLength(1);
  });

  it('clamps color channels but not position', () => {
    // phase and period legitimately push a key off the ends of the ramp, so
    // position has no valid range to clamp to. A channel does.
    const [key] = rampKeys([['-2', '1.5', '-0.5', '0', '2']]);
    expect(key).toEqual({ pos: -2, r: 1, g: 0, b: 0, a: 1 });
  });

  it('reads an absent table as no keys', () => {
    expect(rampKeys(undefined)).toEqual([]);
  });
});

describe('rampGradient', () => {
  it('renders a horizontal ramp left to right', () => {
    expect(rampGradient({ keys: BLACK_TO_WHITE, type: 'horizontal' })).toBe(
      'linear-gradient(to right, rgb(0 0 0 / 1) 0%, rgb(255 255 255 / 1) 100%)',
    );
  });

  it('renders a vertical ramp bottom to top', () => {
    // TD's texture origin is bottom-left, so position 0 of a vertical ramp is
    // the BOTTOM edge — `to bottom` would render it upside down.
    expect(rampGradient({ keys: BLACK_TO_WHITE, type: 'vertical' })).toContain('to top');
  });

  it('falls back to horizontal for the shapes it does not model', () => {
    for (const type of ['radial', 'circular', 'something-new', undefined]) {
      expect(rampGradient({ keys: BLACK_TO_WHITE, type })).toContain('to right');
    }
  });

  it('carries alpha through to the stop color', () => {
    expect(
      rampGradient({
        keys: [
          ['0', '1', '0', '0', '0.5'],
          ['1', '0', '0', '1', '0'],
        ],
      }),
    ).toBe('linear-gradient(to right, rgb(255 0 0 / 0.5) 0%, rgb(0 0 255 / 0) 100%)');
  });

  it('offsets every stop by phase', () => {
    expect(rampGradient({ keys: BLACK_TO_WHITE, phase: 0.25 })).toBe(
      'linear-gradient(to right, rgb(0 0 0 / 1) 25%, rgb(255 255 255 / 1) 125%)',
    );
  });

  it('scales the span by period', () => {
    expect(rampGradient({ keys: BLACK_TO_WHITE, period: 0.5 })).toBe(
      'linear-gradient(to right, rgb(0 0 0 / 1) 0%, rgb(255 255 255 / 1) 50%)',
    );
  });

  it('lets stops run outside 0-100%, which is TD Hold extend', () => {
    // CSS holds the end colors past the edges of the box, which is exactly
    // what the Ramp TOP's default Extend does. Clamping here would flatten it.
    const gradient = rampGradient({ keys: BLACK_TO_WHITE, phase: -0.5, period: 2 })!;
    expect(gradient).toContain('-50%');
    expect(gradient).toContain('150%');
  });

  it('sorts stops so a negative period does not collapse the ramp', () => {
    // CSS clamps an out-of-order stop up to its predecessor, which would turn
    // the whole reversed ramp into one hard edge at 100%.
    expect(rampGradient({ keys: BLACK_TO_WHITE, period: -1 })).toBe(
      'linear-gradient(to right, rgb(255 255 255 / 1) -100%, rgb(0 0 0 / 1) 0%)',
    );
  });

  it('sorts stops the DAT lists out of order', () => {
    const shuffled = [
      ['1', '1', '1', '1', '1'],
      ['0', '0', '0', '0', '1'],
    ];
    expect(rampGradient({ keys: shuffled })).toBe(rampGradient({ keys: BLACK_TO_WHITE }));
  });

  it('doubles each stop for step interpolation, making hard edges', () => {
    expect(rampGradient({ keys: BLACK_TO_WHITE, interp: 'step' })).toBe(
      'linear-gradient(to right, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 1) 100%, rgb(255 255 255 / 1) 100%)',
    );
  });

  it('renders the curve interpolations as linear', () => {
    // A CSS gradient interpolates linearly between stops and nothing here
    // samples the curve, so these are approximations, not omissions.
    const linear = rampGradient({ keys: BLACK_TO_WHITE, interp: 'linear' });
    expect(rampGradient({ keys: BLACK_TO_WHITE, interp: 'easeineaseout' })).toBe(linear);
    expect(rampGradient({ keys: BLACK_TO_WHITE, interp: 'hermite' })).toBe(linear);
  });

  it('renders a single key as a flat fill', () => {
    // One stop is not a legal gradient; the ramp is that color everywhere.
    expect(rampGradient({ keys: [['0.5', '1', '0', '0', '1']] })).toBe(
      'linear-gradient(to right, rgb(255 0 0 / 1) 0%, rgb(255 0 0 / 1) 100%)',
    );
  });

  it('has nothing to draw before the first snapshot', () => {
    expect(rampGradient({ keys: undefined })).toBeUndefined();
    expect(rampGradient({ keys: [] })).toBeUndefined();
    expect(rampGradient({ keys: [['not', 'a', 'keyframe', 'at', 'all']] })).toBeUndefined();
  });

  it('defaults phase to 0 and period to 1 when TD has not synced them', () => {
    // The five names land in separate `update` messages, so a render between
    // them sees some defined and some not.
    expect(rampGradient({ keys: BLACK_TO_WHITE })).toBe(
      rampGradient({ keys: BLACK_TO_WHITE, phase: 0, period: 1 }),
    );
  });
});
