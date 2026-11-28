import type { UsageScores } from './usage';

export const PLAY_GAP_MS = 10_000;
export const MIN_PLAY_MS = 3_000;
export const MIN_SCHEME_USE_MS = 10_000;
export const HALF_LIFE_SHOWS = 5;

export interface Play {
  key: string;
  /** Counted in Shows, not days: the newest Show is 0. */
  showsAgo: number;
  /** Time on only — the gaps a Play was joined across are not in it. */
  onMs: number;
}

// Linear in time on, so a score never depends on where its Plays happen to be split.
export function playValue(onMs: number): number {
  return onMs / 60_000;
}

export function playWeight(play: Play, halfLifeShows = HALF_LIFE_SHOWS): number {
  return playValue(play.onMs) * 0.5 ** (play.showsAgo / halfLifeShows);
}

export function usageScores(
  plays: readonly Play[],
  options: { minMs: number; halfLifeShows?: number },
): UsageScores {
  const scores: UsageScores = {};
  for (const play of plays) {
    if (play.onMs < options.minMs) continue;
    scores[play.key] = (scores[play.key] ?? 0) + playWeight(play, options.halfLifeShows);
  }
  return scores;
}

// Stable, so entries that tie — every unplayed one among them — keep the order they arrived in.
export function sortByUsage<T>(
  items: readonly T[],
  scores: UsageScores,
  keyOf: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => (scores[keyOf(b)] ?? 0) - (scores[keyOf(a)] ?? 0));
}
