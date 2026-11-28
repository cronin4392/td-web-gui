import { createResource, createSignal, type Accessor } from 'solid-js';
import { sortByUsage } from '@domain/usage/score';
import type { UsageKind, UsageScores } from '@domain/usage/usage';
import { fetchScores } from './usage-api';

export interface UsageSort {
  byUsage: Accessor<boolean>;
  toggle: () => void;
  /** `items` by Usage score while the mode is on, untouched while it is off. */
  sorted: <T>(items: readonly T[], keyOf: (item: T) => string) => readonly T[];
}

// Refetched each time the mode is switched on, so a Show in progress shows up in it.
export function createUsageSort(kind: UsageKind): UsageSort {
  const [byUsage, setByUsage] = createSignal(false);
  const [scores, { refetch }] = createResource<UsageScores>(() => fetchScores(kind), {
    initialValue: {},
  });

  function toggle(): void {
    const next = !byUsage();
    setByUsage(next);
    if (next) void refetch();
  }

  return {
    byUsage,
    toggle,
    sorted: (items, keyOf) => (byUsage() ? sortByUsage(items, scores(), keyOf) : items),
  };
}
