export type Health = 'good' | 'warn' | 'bad';

export interface Thresholds {
  good: number;
  warn: number;
}

// 30 is the rate every scene project runs at, and the MB figures are absolute
// because the whole rig is one machine — neither travels to another setup.
export const FPS_LIMITS: Thresholds = { good: 30, warn: 27 };
export const COOK_TIME_LIMITS: Thresholds = { good: 16, warn: 30 };
export const GPU_MEMORY_LIMITS: Thresholds = { good: 400, warn: 700 };

export const atLeast = (value: number, limits: Thresholds): Health =>
  value >= limits.good ? 'good' : value >= limits.warn ? 'warn' : 'bad';

export const under = (value: number, limits: Thresholds): Health =>
  value < limits.good ? 'good' : value < limits.warn ? 'warn' : 'bad';
