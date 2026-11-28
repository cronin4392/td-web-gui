import { toxName } from '../../domain/catalog/tox';
import {
  IDLE_PAUSE_MS,
  LOST_REPORT_MS,
  isOn,
  midiStep,
  type LayerReport,
  type ToxKind,
  type UsageReport,
} from '../../domain/usage/usage';

export interface SpanFields {
  kind: ToxKind;
  name: string;
  layer: string;
  layout: string;
  color: string;
}

// `end*` only moves a row's `ended_at`: extending a row and closing it are the same write.
// `resumed` marks a row reopening what an Idle pause closed, which the Play query joins back on.
export interface SpanSink {
  openSpan(span: SpanFields, at: number, resumed: boolean): number;
  endSpan(id: number, at: number): void;
  openSchemeSpan(path: string, at: number, resumed: boolean): number;
  endSchemeSpan(id: number, at: number): void;
}

export interface ContentRoots {
  scenes: string;
  effects: string;
}

export interface Tracker {
  report(report: UsageReport, now: number): void;
  stop(now: number): void;
  paused(): boolean;
}

// Case- and separator-insensitive: these are Windows paths, and TD reports whatever its par holds.
function isUnder(path: string, root: string): boolean {
  const normalise = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const prefix = normalise(root);
  return prefix !== '' && normalise(path).startsWith(`${prefix}/`);
}

export function classifyTox(path: string, roots: ContentRoots): ToxKind | undefined {
  if (isUnder(path, roots.scenes)) return 'scene';
  if (isUnder(path, roots.effects)) return 'effect';
  return undefined;
}

// The Loader's blank Tox sits under the scenes root, so the root check alone would track an empty Layer.
const BLANK_TOX = '0blank';

function spanFor(layer: LayerReport, roots: ContentRoots): SpanFields | undefined {
  if (!isOn(layer.level)) return undefined;
  const kind = classifyTox(layer.activeScene, roots);
  const name = toxName(layer.activeScene);
  if (!kind || !name || name.toLowerCase() === BLANK_TOX) return undefined;
  return { kind, name, layer: layer.layer, layout: layer.layout, color: layer.color };
}

function sameSpan(a: SpanFields, b: SpanFields): boolean {
  return a.kind === b.kind && a.name === b.name && a.layout === b.layout && a.color === b.color;
}

// Wider than what splits a Span: a fader move that never crosses the off level still holds off the Idle pause.
function fingerprint(layer: LayerReport): string {
  return JSON.stringify([layer.activeScene, midiStep(layer.level), layer.layout, layer.color]);
}

// A Layer a report leaves out, or an empty Color scheme, is a Loader that page has not synced: no information, never "off".
export function createTracker(roots: ContentRoots, sink: SpanSink): Tracker {
  const known = new Map<string, { state: LayerReport; seenAt: number }>();
  let knownScheme: { path: string; seenAt: number } | undefined;
  const fingerprints = new Map<string, string>();
  let schemeFingerprint: string | undefined;

  const open = new Map<string, { id: number; span: SpanFields }>();
  let scheme: { id: number; path: string } | undefined;
  let lastChangeAt = 0;
  let lastReportAt: number | undefined;
  let paused = false;
  const heldThroughPause = new Map<string, SpanFields>();
  let schemeHeldThroughPause: string | undefined;

  function forgetPause(): void {
    heldThroughPause.clear();
    schemeHeldThroughPause = undefined;
  }

  function pause(at: number): void {
    forgetPause();
    for (const [layer, { span }] of open) heldThroughPause.set(layer, span);
    schemeHeldThroughPause = scheme?.path;
    closeAll(at);
    paused = true;
  }

  function closeAll(at: number): void {
    for (const { id } of open.values()) sink.endSpan(id, at);
    open.clear();
    if (scheme) sink.endSchemeSpan(scheme.id, at);
    scheme = undefined;
  }

  // A row's `ended_at` already sits at the last report that mentioned it, so ending it there is forgetting it.
  function forgetStale(now: number): void {
    for (const [layer, { seenAt }] of known) {
      if (now - seenAt <= LOST_REPORT_MS) continue;
      known.delete(layer);
      open.delete(layer);
      heldThroughPause.delete(layer);
    }
    if (knownScheme && now - knownScheme.seenAt > LOST_REPORT_MS) {
      knownScheme = undefined;
      scheme = undefined;
      schemeHeldThroughPause = undefined;
    }
  }

  function remember(report: UsageReport, now: number): boolean {
    let changed = false;
    for (const layer of report.layers) {
      known.set(layer.layer, { state: layer, seenAt: now });
      const seen = fingerprint(layer);
      if (fingerprints.get(layer.layer) !== seen) changed = true;
      fingerprints.set(layer.layer, seen);
    }
    if (report.activeColorScheme) {
      knownScheme = { path: report.activeColorScheme, seenAt: now };
      if (schemeFingerprint !== report.activeColorScheme) changed = true;
      schemeFingerprint = report.activeColorScheme;
    }
    return changed;
  }

  function reconcileLayers(report: UsageReport, now: number): void {
    for (const layer of report.layers) {
      const wanted = spanFor(layer, roots);
      const held = heldThroughPause.get(layer.layer);
      heldThroughPause.delete(layer.layer);
      const current = open.get(layer.layer);
      if (current) {
        sink.endSpan(current.id, now);
        if (wanted && sameSpan(current.span, wanted)) continue;
        open.delete(layer.layer);
      }
      if (!wanted) continue;
      const resumed = held?.kind === wanted.kind && held.name === wanted.name;
      open.set(layer.layer, { id: sink.openSpan(wanted, now, resumed), span: wanted });
    }
  }

  function reconcileScheme(report: UsageReport, now: number): void {
    const anyLayerOn = [...known.values()].some(({ state }) => isOn(state.level));
    const wanted = anyLayerOn ? knownScheme?.path : undefined;
    const informed = report.activeColorScheme !== '';
    if (scheme?.path === wanted) {
      if (scheme && informed) sink.endSchemeSpan(scheme.id, now);
      return;
    }
    if (scheme) sink.endSchemeSpan(scheme.id, now);
    scheme = undefined;
    if (!wanted) return;
    const resumed = schemeHeldThroughPause === wanted;
    schemeHeldThroughPause = undefined;
    scheme = { id: sink.openSchemeSpan(wanted, now, resumed), path: wanted };
  }

  // A clock stepped backwards would otherwise end a row before it started.
  function clamp(at: number): number {
    return Math.max(at, lastReportAt ?? at);
  }

  return {
    report(report, at) {
      const now = clamp(at);
      forgetStale(now);
      // Before the change is looked at: one arriving past the mark still ends the idle stretch at the mark.
      if (!paused && lastReportAt !== undefined && now - lastChangeAt >= IDLE_PAUSE_MS) {
        pause(lastChangeAt + IDLE_PAUSE_MS);
      }
      lastReportAt = now;

      if (remember(report, now)) {
        lastChangeAt = now;
        paused = false;
      }
      if (paused) return;

      reconcileLayers(report, now);
      reconcileScheme(report, now);
    },

    stop(at) {
      const now = clamp(at);
      forgetStale(now);
      if (!paused) closeAll(Math.min(now, lastChangeAt + IDLE_PAUSE_MS));
    },

    paused: () => paused,
  };
}
