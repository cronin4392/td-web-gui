export const MIDI_STEPS = 127;
// One step above zero still counts as off: a controller can stick just short of the bottom.
export const OFF_BELOW_STEP = 2;
export const HEARTBEAT_MS = 15_000;
// Past a minute: Chrome throttles a hidden page's timers to one a minute, and a late heartbeat is not a lost one.
export const LOST_REPORT_MS = 90_000;
export const IDLE_PAUSE_MS = 5 * 60_000;
export const SHOW_CONTINUES_WITHIN_MS = 60 * 60_000;

export const USAGE_KINDS = ['scene', 'effect', 'scheme'] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];
export type ToxKind = Exclude<UsageKind, 'scheme'>;

export interface LayerReport {
  layer: string;
  activeScene: string;
  level: number;
  layout: string;
  color: string;
}

export interface UsageReport {
  layers: LayerReport[];
  activeColorScheme: string;
}

export interface LiveStatus {
  on: boolean;
  paused: boolean;
}

export type UsageScores = Record<string, number>;

export function midiStep(level: number): number {
  return Math.round(level * MIDI_STEPS);
}

export function isOn(level: number): boolean {
  return midiStep(level) >= OFF_BELOW_STEP;
}

export function isUsageKind(x: unknown): x is UsageKind {
  return (USAGE_KINDS as readonly unknown[]).includes(x);
}

function isLayerReport(x: unknown): x is LayerReport {
  if (typeof x !== 'object' || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.layer === 'string' &&
    l.layer !== '' &&
    typeof l.activeScene === 'string' &&
    typeof l.level === 'number' &&
    Number.isFinite(l.level) &&
    typeof l.layout === 'string' &&
    typeof l.color === 'string'
  );
}

export function isUsageReport(x: unknown): x is UsageReport {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    Array.isArray(r.layers) &&
    r.layers.every(isLayerReport) &&
    typeof r.activeColorScheme === 'string'
  );
}

export function isLiveStatus(x: unknown): x is LiveStatus {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return typeof s.on === 'boolean' && typeof s.paused === 'boolean';
}

export interface LayerEntry {
  kind: ToxKind;
  name: string;
  score: number;
}

/** Each Layer's own entries, highest Usage score first. */
export type LayerScores = Record<string, LayerEntry[]>;

function isLayerEntry(x: unknown): x is LayerEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    (e.kind === 'scene' || e.kind === 'effect') &&
    typeof e.name === 'string' &&
    typeof e.score === 'number'
  );
}

export function isLayerScores(x: unknown): x is LayerScores {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  return Object.values(x).every((v) => Array.isArray(v) && v.every(isLayerEntry));
}

export function isUsageScores(x: unknown): x is UsageScores {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  return Object.values(x).every((v) => typeof v === 'number');
}
