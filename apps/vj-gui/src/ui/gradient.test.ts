/**
 * The sampled-ramp → CSS gradient translation. What arrives is TouchDesigner's
 * output, not a validated structure, so parsing has to survive short rows,
 * non-numeric cells, and stops listed out of order — CSS turns an out-of-order
 * stop into a hard edge rather than an error.
 */

import { describe, expect, it } from 'vitest';
import { colorStopsGradient, rampKeys } from './gradient';

/** Black at the start, white at the end. */
const BLACK_TO_WHITE = [
  [0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
];

describe('rampKeys', () => {
  it('reads pos and rgba off each row', () => {
    expect(rampKeys([[0.5, 1, 0, 0, 0.25]])).toEqual([{ pos: 0.5, r: 1, g: 0, b: 0, a: 0.25 }]);
  });

  it('reads a text row the same as a numeric one', () => {
    // TD sends numbers; a row read straight off a DAT is text.
    expect(rampKeys([['0.5', '1', '0', '0', '0.25']])).toEqual(rampKeys([[0.5, 1, 0, 0, 0.25]]));
  });

  it('skips a header row without being told there is one', () => {
    const keys = rampKeys([['pos', 'r', 'g', 'b', 'a'], ...BLACK_TO_WHITE]);
    expect(keys.map((k) => k.pos)).toEqual([0, 1]);
  });

  it('skips rows too short to be a keyframe', () => {
    expect(rampKeys([[0, 1, 1]])).toEqual([]);
  });

  it('ignores extra columns', () => {
    expect(rampKeys([[0, 1, 1, 1, 1, 99]])).toHaveLength(1);
  });

  it('clamps color channels but not position', () => {
    // A float ramp can carry channels outside 0-1; a position outside it is
    // just a stop off the end of the bar, which CSS handles.
    const [key] = rampKeys([[-2, 1.5, -0.5, 0, 2]]);
    expect(key).toEqual({ pos: -2, r: 1, g: 0, b: 0, a: 1 });
  });

  it('reads an absent table as no keys', () => {
    expect(rampKeys(undefined)).toEqual([]);
  });
});

describe('colorStopsGradient', () => {
  it('lays stops out left to right', () => {
    expect(
      colorStopsGradient([
        [0, 1, 0, 0, 1],
        [0.5, 0, 1, 0, 1],
        [1, 0, 0, 1, 1],
      ]),
    ).toBe(
      'linear-gradient(to right, rgb(255 0 0 / 1) 0%, rgb(0 255 0 / 1) 50%, rgb(0 0 255 / 1) 100%)',
    );
  });

  it('places a stop at the position TD sampled it', () => {
    // No phase or period of its own: TD applied both before sampling.
    expect(
      colorStopsGradient([
        [0.25, 0, 0, 0, 1],
        [0.75, 1, 1, 1, 1],
      ]),
    ).toBe('linear-gradient(to right, rgb(0 0 0 / 1) 25%, rgb(255 255 255 / 1) 75%)');
  });

  it('carries alpha through to the stop color', () => {
    expect(
      colorStopsGradient([
        [0, 1, 1, 1, 0],
        [1, 1, 1, 1, 1],
      ]),
    ).toBe('linear-gradient(to right, rgb(255 255 255 / 0) 0%, rgb(255 255 255 / 1) 100%)');
  });

  it('sorts stops listed out of order', () => {
    // CSS clamps an out-of-order stop up to its predecessor, which would turn
    // the whole ramp into one hard edge.
    expect(colorStopsGradient([...BLACK_TO_WHITE].reverse())).toBe(
      colorStopsGradient(BLACK_TO_WHITE),
    );
  });

  it('trims a long offset rather than printing its float noise', () => {
    expect(
      colorStopsGradient([
        [0.4892, 1, 0, 0, 1],
        [1, 0, 0, 1, 1],
      ]),
    ).toContain('48.92%');
  });

  it('renders a single stop as a flat fill', () => {
    // One stop is not a legal gradient; the ramp is that color everywhere.
    expect(colorStopsGradient([[0.5, 1, 0, 0, 1]])).toBe(
      'linear-gradient(to right, rgb(255 0 0 / 1) 0%, rgb(255 0 0 / 1) 100%)',
    );
  });

  it('has nothing to draw before the catalog arrives', () => {
    expect(colorStopsGradient(undefined)).toBeUndefined();
    expect(colorStopsGradient([])).toBeUndefined();
    expect(colorStopsGradient([['not', 'a', 'keyframe', 'at', 'all']])).toBeUndefined();
  });
});
