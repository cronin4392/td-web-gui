import { describe, expect, it } from 'vitest';
import {
  HALF_LIFE_SHOWS,
  MIN_PLAY_MS,
  MIN_SCHEME_USE_MS,
  playValue,
  playWeight,
  sortByUsage,
  usageScores,
} from './score';

const MINUTE = 60_000;

describe('playValue', () => {
  it('is the minutes the Play was on', () => {
    expect(playValue(0)).toBe(0);
    expect(playValue(MINUTE)).toBe(1);
    expect(playValue(7 * MINUTE)).toBe(7);
  });
});

describe('playWeight', () => {
  it('is the full play value in the newest Show', () => {
    expect(playWeight({ key: 'x', showsAgo: 0, onMs: 2 * MINUTE })).toBe(2);
  });

  it('halves every half-life of Shows', () => {
    expect(playWeight({ key: 'x', showsAgo: HALF_LIFE_SHOWS, onMs: MINUTE })).toBeCloseTo(0.5);
    expect(playWeight({ key: 'x', showsAgo: 2 * HALF_LIFE_SHOWS, onMs: MINUTE })).toBeCloseTo(0.25);
  });

  it('recomputes under a different half-life', () => {
    expect(playWeight({ key: 'x', showsAgo: 1, onMs: MINUTE }, 1)).toBeCloseTo(0.5);
  });
});

describe('usageScores', () => {
  it('sums the weights of an entry’s Plays', () => {
    const scores = usageScores(
      [
        { key: 'x', showsAgo: 0, onMs: MINUTE },
        { key: 'x', showsAgo: 0, onMs: 3 * MINUTE },
        { key: 'y', showsAgo: 0, onMs: MINUTE },
      ],
      { minMs: MIN_PLAY_MS },
    );
    expect(scores).toEqual({ x: 4, y: 1 });
  });

  it('scores two short Plays the same as one Play of their combined length', () => {
    const scores = usageScores(
      [
        { key: 'split', showsAgo: 0, onMs: 10_000 },
        { key: 'split', showsAgo: 0, onMs: 10_000 },
        { key: 'whole', showsAgo: 0, onMs: 20_000 },
      ],
      { minMs: MIN_PLAY_MS },
    );
    expect(scores.split).toBeCloseTo(scores.whole!);
  });

  it('ignores a Play shorter than the minimum', () => {
    const scores = usageScores(
      [
        { key: 'x', showsAgo: 0, onMs: MIN_PLAY_MS - 1 },
        { key: 'y', showsAgo: 0, onMs: MIN_PLAY_MS },
      ],
      { minMs: MIN_PLAY_MS },
    );
    expect(Object.keys(scores)).toEqual(['y']);
  });

  it('credits only the scheme settled on when flipping through several', () => {
    const scores = usageScores(
      [
        { key: 'A', showsAgo: 0, onMs: 291_000 },
        { key: 'B', showsAgo: 0, onMs: 4_000 },
        { key: 'C', showsAgo: 0, onMs: 5_000 },
      ],
      { minMs: MIN_SCHEME_USE_MS },
    );
    expect(Object.keys(scores)).toEqual(['A']);
  });
});

describe('sortByUsage', () => {
  it('puts the highest score first and leaves ties in their given order', () => {
    const sorted = sortByUsage(['a', 'b', 'c', 'd'], { c: 2, b: 5 }, (name) => name);
    expect(sorted).toEqual(['b', 'c', 'a', 'd']);
  });
});
