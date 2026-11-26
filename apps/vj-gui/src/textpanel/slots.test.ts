import { describe, expect, it } from 'vitest';
import { expandedSlots, isOverridden, reachedSlots } from './slots';

describe('isOverridden', () => {
  it('is false with no overrides, or only blank ones', () => {
    expect(isOverridden([])).toBe(false);
    expect(isOverridden(['', '  '])).toBe(false);
  });

  it('is true once any slot is non-blank', () => {
    expect(isOverridden(['', 'X'])).toBe(true);
  });
});

describe('reachedSlots', () => {
  it('is never fewer than the two collapsed slots', () => {
    expect(reachedSlots(0, [])).toBe(2);
    expect(reachedSlots(1, ['X'])).toBe(2);
  });

  it('reaches the end of the act text list', () => {
    expect(reachedSlots(4, [])).toBe(4);
  });

  it('reaches the last non-blank override, ignoring blanks after it', () => {
    expect(reachedSlots(1, ['', '', 'Z', '', ' '])).toBe(3);
  });
});

describe('expandedSlots', () => {
  it('adds one spare slot after a full run of filled slots', () => {
    expect(expandedSlots(0, ['X', 'Y'])).toBe(3);
    expect(expandedSlots(3, ['X', 'Y', 'Z'])).toBe(4);
  });

  it('adds no spare slot while a slot above it is blank', () => {
    expect(expandedSlots(0, ['', 'Y'])).toBe(2);
    expect(expandedSlots(3, ['X', '', 'Z'])).toBe(3);
  });

  it('adds no spare slot past the act text list while the layer has no override', () => {
    expect(expandedSlots(3, [])).toBe(3);
  });

  it('counts a blank slot after the filled run as the spare one', () => {
    expect(expandedSlots(0, ['X', 'Y', ''])).toBe(3);
  });
});
