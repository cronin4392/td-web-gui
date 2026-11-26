import { isBlank } from '@domain/textstate/textstate';

export const COLLAPSED_SLOTS = 2;

export function isOverridden(overrides: readonly string[]): boolean {
  return overrides.some((text) => !isBlank(text));
}

export function reachedSlots(actLength: number, overrides: readonly string[]): number {
  const lastOverridden = overrides.findLastIndex((text) => !isBlank(text));
  return Math.max(COLLAPSED_SLOTS, actLength, lastOverridden + 1);
}

// A full run of filled slots always ends in one spare slot, so a next one can be added.
export function expandedSlots(actLength: number, overrides: readonly string[]): number {
  const firstBlank = overrides.findIndex((text) => isBlank(text));
  const leadingFilled = firstBlank === -1 ? overrides.length : firstBlank;
  return Math.max(reachedSlots(actLength, overrides), leadingFilled + 1);
}
