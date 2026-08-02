import { describe, expect, it } from 'vitest';
import {
  atLeast,
  under,
  COOK_TIME_LIMITS,
  FPS_LIMITS,
  GPU_MEMORY_LIMITS,
  type Thresholds,
} from './health';

const limits: Thresholds = { good: 10, warn: 5 };
// Lower-is-better reverses the pair: the budget is the smaller number.
const budget: Thresholds = { good: 5, warn: 10 };

describe('atLeast', () => {
  it('is good at the target and above', () => {
    expect(atLeast(10, limits)).toBe('good');
    expect(atLeast(11, limits)).toBe('good');
  });

  it('is warn from the floor up to the target', () => {
    expect(atLeast(5, limits)).toBe('warn');
    expect(atLeast(9, limits)).toBe('warn');
  });

  it('is bad below the floor', () => {
    expect(atLeast(4, limits)).toBe('bad');
    expect(atLeast(0, limits)).toBe('bad');
  });
});

describe('under', () => {
  it('is good below the budget', () => {
    expect(under(4, budget)).toBe('good');
    expect(under(0, budget)).toBe('good');
  });

  it('is warn from the budget up to the ceiling', () => {
    expect(under(5, budget)).toBe('warn');
    expect(under(9, budget)).toBe('warn');
  });

  it('is bad at the ceiling and above', () => {
    expect(under(10, budget)).toBe('bad');
    expect(under(99, budget)).toBe('bad');
  });
});

describe('the scene limits', () => {
  it('reads a scene holding its frame rate as good', () => {
    expect(atLeast(30, FPS_LIMITS)).toBe('good');
    expect(atLeast(28, FPS_LIMITS)).toBe('warn');
    expect(atLeast(20, FPS_LIMITS)).toBe('bad');
  });

  it('reads a cook time inside the frame budget as good', () => {
    expect(under(9.4, COOK_TIME_LIMITS)).toBe('good');
    expect(under(20, COOK_TIME_LIMITS)).toBe('warn');
    expect(under(40, COOK_TIME_LIMITS)).toBe('bad');
  });

  it('reads GPU memory against the machine budget', () => {
    expect(under(129, GPU_MEMORY_LIMITS)).toBe('good');
    expect(under(500, GPU_MEMORY_LIMITS)).toBe('warn');
    expect(under(900, GPU_MEMORY_LIMITS)).toBe('bad');
  });
});
