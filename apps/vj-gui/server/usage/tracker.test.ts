// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  HEARTBEAT_MS,
  IDLE_PAUSE_MS,
  LOST_REPORT_MS,
  type LayerReport,
  type UsageReport,
} from '../../domain/usage/usage';
import {
  classifyTox,
  createTracker,
  type SpanFields,
  type SpanSink,
  type Tracker,
} from './tracker';

const ROOTS = { scenes: 'C:/VJ/Scenes', effects: 'C:/VJ/Effects' };
const SCENE_X = 'C:/VJ/Scenes/X/X.tox';
const SCENE_Y = 'C:/VJ/Scenes/Y/Y.tox';
const EFFECT = 'C:/VJ/Effects/3 Effect/Blur/Blur.tox';
const BLANK = 'C:/VJ/Loader/blank.tox';
const STEP = 1 / 127;
const SECOND = 1_000;

interface Row extends SpanFields {
  from: number;
  to: number;
  resumed?: true;
}
interface SchemeRow {
  path: string;
  from: number;
  to: number;
  resumed?: true;
}

let spans: Row[];
let schemeSpans: SchemeRow[];
let tracker: Tracker;

const sink: SpanSink = {
  openSpan: (span, at, resumed) =>
    spans.push({ ...span, from: at, to: at, ...(resumed && { resumed }) }) - 1,
  endSpan: (id, at) => {
    spans[id]!.to = at;
  },
  openSchemeSpan: (path, at, resumed) =>
    schemeSpans.push({ path, from: at, to: at, ...(resumed && { resumed }) }) - 1,
  endSchemeSpan: (id, at) => {
    schemeSpans[id]!.to = at;
  },
};

function layer(overrides: Partial<LayerReport> = {}): LayerReport {
  return {
    layer: 'A',
    activeScene: SCENE_X,
    level: 1,
    layout: 'normal',
    color: 'normal',
    ...overrides,
  };
}

function report(layers: LayerReport[], activeColorScheme = 'Colors/Red'): UsageReport {
  return { layers, activeColorScheme };
}

/** Holds `state` from `from` to `to`, reporting it on the heartbeat. */
function hold(state: UsageReport, from: number, to: number): void {
  for (let at = from; at <= to; at += HEARTBEAT_MS) tracker.report(state, at);
}

/** Each state is reported at its own time, then on the heartbeat until the next one. */
function perform(changes: [at: number, state: UsageReport][]): void {
  for (const [index, [at, state]] of changes.entries()) {
    const next = changes[index + 1]?.[0] ?? at + 1;
    for (let time = at; time < next; time += HEARTBEAT_MS) tracker.report(state, time);
  }
}

beforeEach(() => {
  spans = [];
  schemeSpans = [];
  tracker = createTracker(ROOTS, sink);
});

describe('classifyTox', () => {
  it('tells a Scene from an Effect by its content root', () => {
    expect(classifyTox(SCENE_X, ROOTS)).toBe('scene');
    expect(classifyTox(EFFECT, ROOTS)).toBe('effect');
  });

  it('matches whatever separators and case TD reports', () => {
    expect(classifyTox('c:\\vj\\scenes\\X\\X.tox', ROOTS)).toBe('scene');
  });

  it('leaves a Tox under neither root untracked', () => {
    expect(classifyTox(BLANK, ROOTS)).toBeUndefined();
    expect(classifyTox('C:/VJ/ScenesOld/X/X.tox', ROOTS)).toBeUndefined();
    expect(classifyTox(SCENE_X, { scenes: '', effects: '' })).toBeUndefined();
  });
});

describe('createTracker', () => {
  it('follows the plan’s worked example for one Layer', () => {
    const at = (minutes: number, seconds: number) => (minutes * 60 + seconds) * SECOND;
    const splitX = { layout: 'splitX' };
    const edge = { layout: 'splitX', color: 'edge' };

    perform([
      [at(0, 0), report([layer({ level: 0 })])],
      [at(0, 20), report([layer({ level: 0, ...splitX })])],
      [at(0, 30), report([layer(splitX)])],
      [at(2, 0), report([layer(edge)])],
      [at(3, 5), report([layer({ ...edge, level: 0.2 })])],
      [at(3, 10), report([layer(edge)])],
      [at(3, 30), report([layer({ ...edge, level: 0 })])],
      [at(3, 36), report([layer(edge)])],
      [at(4, 0), report([layer({ ...edge, level: 0 })])],
      [at(4, 40), report([layer(edge)])],
      [at(5, 0), report([layer({ activeScene: SCENE_Y })])],
      [at(6, 0), report([layer({ activeScene: BLANK })])],
    ]);

    const x = { kind: 'scene', name: 'X', layer: 'A', layout: 'splitX' };
    expect(spans).toEqual([
      { ...x, color: 'normal', from: at(0, 30), to: at(2, 0) },
      { ...x, color: 'edge', from: at(2, 0), to: at(3, 30) },
      { ...x, color: 'edge', from: at(3, 36), to: at(4, 0) },
      { ...x, color: 'edge', from: at(4, 40), to: at(5, 0) },
      {
        kind: 'scene',
        name: 'Y',
        layer: 'A',
        layout: 'normal',
        color: 'normal',
        from: at(5, 0),
        to: at(6, 0),
      },
    ]);
  });

  it('treats one MIDI step above zero as off', () => {
    tracker.report(report([layer({ level: STEP })]), 0);
    expect(spans).toEqual([]);
    expect(schemeSpans).toEqual([]);

    tracker.report(report([layer({ level: 2 * STEP })]), SECOND);
    expect(spans).toHaveLength(1);
  });

  it('only extends the open Span on a heartbeat', () => {
    hold(report([layer()]), 0, 4 * HEARTBEAT_MS);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ from: 0, to: 4 * HEARTBEAT_MS });
  });

  it('makes one Span of the same report from two tabs', () => {
    tracker.report(report([layer()]), 0);
    tracker.report(report([layer()]), 5);
    expect(spans).toHaveLength(1);
    expect(schemeSpans).toHaveLength(1);
  });

  it('records an Effect as its own kind', () => {
    tracker.report(report([layer({ activeScene: EFFECT })]), 0);
    expect(spans[0]).toMatchObject({ kind: 'effect', name: 'Blur' });
  });

  it('tracks each Layer on its own', () => {
    tracker.report(report([layer(), layer({ layer: 'Z1', activeScene: SCENE_Y })]), 0);
    tracker.report(
      report([layer(), layer({ layer: 'Z1', activeScene: SCENE_Y, level: 0 })]),
      SECOND,
    );
    tracker.report(report([layer()]), 2 * SECOND);
    expect(spans.map(({ layer: id, name, to }) => [id, name, to])).toEqual([
      ['A', 'X', 2 * SECOND],
      ['Z1', 'Y', SECOND],
    ]);
  });

  it('does not track the blank Tox, though it sits under the scenes root', () => {
    tracker.report(report([layer({ activeScene: 'C:/VJ/Scenes/0Blank/0Blank.tox' })]), 0);
    expect(spans).toEqual([]);
    expect(schemeSpans).toHaveLength(1);
  });

  it('takes a Layer missing from a report as no information, not as off', () => {
    tracker.report(report([layer()]), 0);
    tracker.report(report([], ''), SECOND);
    expect(spans).toEqual([expect.objectContaining({ from: 0, to: 0 })]);
    expect(schemeSpans).toEqual([{ path: 'Colors/Red', from: 0, to: 0 }]);

    tracker.report(report([layer()]), 2 * SECOND);
    expect(spans).toEqual([expect.objectContaining({ from: 0, to: 2 * SECOND })]);
    expect(schemeSpans).toEqual([{ path: 'Colors/Red', from: 0, to: 2 * SECOND }]);
  });

  it('forgets a Layer no report has mentioned for too long', () => {
    tracker.report(report([layer(), layer({ layer: 'B' })]), 0);
    hold(report([layer({ layer: 'B' })]), HEARTBEAT_MS, LOST_REPORT_MS + HEARTBEAT_MS);
    const back = LOST_REPORT_MS + 2 * HEARTBEAT_MS;
    tracker.report(report([layer(), layer({ layer: 'B' })]), back);

    expect(spans.filter((span) => span.layer === 'A')).toEqual([
      expect.objectContaining({ from: 0, to: 0 }),
      expect.objectContaining({ from: back, to: back }),
    ]);
    expect(spans.filter((span) => span.layer === 'B')).toHaveLength(1);
  });

  it('keeps one Span per Layer when two tabs see different Layers', () => {
    const both = report([layer(), layer({ layer: 'B' })]);
    const onlyA = report([layer()], '');
    for (let at = 0; at <= 2 * IDLE_PAUSE_MS; at += HEARTBEAT_MS) {
      tracker.report(both, at);
      tracker.report(onlyA, at + 7 * SECOND);
    }

    expect(spans).toEqual([
      expect.objectContaining({ layer: 'A', from: 0, to: IDLE_PAUSE_MS }),
      expect.objectContaining({ layer: 'B', from: 0, to: IDLE_PAUSE_MS }),
    ]);
    expect(schemeSpans).toEqual([{ path: 'Colors/Red', from: 0, to: IDLE_PAUSE_MS }]);
    expect(tracker.paused()).toBe(true);
  });

  it('keeps one Span through heartbeats a minute apart', () => {
    for (let at = 0; at <= 4 * 60 * SECOND; at += 60 * SECOND)
      tracker.report(report([layer()]), at);
    expect(spans).toEqual([expect.objectContaining({ from: 0, to: 4 * 60 * SECOND })]);
  });

  it('ends the idle stretch at the 5-minute mark when the next change arrives after it', () => {
    hold(report([layer()]), 0, IDLE_PAUSE_MS - HEARTBEAT_MS);
    const changed = IDLE_PAUSE_MS + 10 * SECOND;
    tracker.report(report([layer({ level: 0.5 })]), changed);

    expect(spans).toEqual([
      expect.objectContaining({ from: 0, to: IDLE_PAUSE_MS }),
      expect.objectContaining({ from: changed, resumed: true }),
    ]);
  });

  it('never ends a row before it started when the clock steps back', () => {
    tracker.report(report([layer()]), 115 * SECOND);
    tracker.report(report([layer()]), 95 * SECOND);
    tracker.stop(90 * SECOND);
    expect(spans).toEqual([expect.objectContaining({ from: 115 * SECOND, to: 115 * SECOND })]);
    expect(schemeSpans[0]).toMatchObject({ from: 115 * SECOND, to: 115 * SECOND });
  });

  it('closes everything at the 5-minute mark of an Idle pause, and resumes on a change', () => {
    const state = report([layer()]);
    hold(state, 0, 2 * IDLE_PAUSE_MS - HEARTBEAT_MS);
    expect(tracker.paused()).toBe(true);
    expect(spans).toEqual([expect.objectContaining({ from: 0, to: IDLE_PAUSE_MS })]);
    expect(schemeSpans).toEqual([{ path: 'Colors/Red', from: 0, to: IDLE_PAUSE_MS }]);

    const resumed = 2 * IDLE_PAUSE_MS;
    tracker.report(report([layer({ level: 1 - STEP })]), resumed);
    expect(tracker.paused()).toBe(false);
    expect(spans).toHaveLength(2);
    expect(spans[1]).toMatchObject({ name: 'X', from: resumed, resumed: true });
    expect(schemeSpans[1]).toEqual({
      path: 'Colors/Red',
      from: resumed,
      to: resumed,
      resumed: true,
    });
  });

  it('marks only what stayed on through the pause as resumed', () => {
    hold(report([layer(), layer({ layer: 'B', activeScene: SCENE_Y })]), 0, IDLE_PAUSE_MS);
    const after = IDLE_PAUSE_MS + SECOND;

    tracker.report(
      report([layer({ color: 'edge' }), layer({ layer: 'B', activeScene: EFFECT })], 'Colors/Blue'),
      after,
    );
    expect(spans[2]).toMatchObject({ layer: 'A', name: 'X', color: 'edge', resumed: true });
    expect(spans[3]).toMatchObject({ layer: 'B', name: 'Blur' });
    expect(spans[3]).not.toHaveProperty('resumed');
    expect(schemeSpans[1]).toEqual({ path: 'Colors/Blue', from: after, to: after });
  });

  it('does not mark a Tox that went off as the pause ended and came back later', () => {
    hold(report([layer()]), 0, IDLE_PAUSE_MS);
    tracker.report(report([layer({ level: 0 })]), IDLE_PAUSE_MS + SECOND);
    tracker.report(report([layer()]), IDLE_PAUSE_MS + 2 * SECOND);
    expect(spans).toHaveLength(2);
    expect(spans[1]).not.toHaveProperty('resumed');
  });

  it('does not mark a Tox as resumed when reports were lost during the pause', () => {
    hold(report([layer()]), 0, IDLE_PAUSE_MS);
    tracker.report(report([layer({ level: 0.5 })]), IDLE_PAUSE_MS + LOST_REPORT_MS + SECOND);
    expect(spans[1]).not.toHaveProperty('resumed');
  });

  it('counts a fader move that never crosses the off level as a change', () => {
    const moved = IDLE_PAUSE_MS - HEARTBEAT_MS;
    hold(report([layer()]), 0, moved - HEARTBEAT_MS);
    hold(report([layer({ level: 0.5 })]), moved, IDLE_PAUSE_MS + HEARTBEAT_MS);
    expect(tracker.paused()).toBe(false);
    expect(spans).toHaveLength(1);
  });

  it('does not count a move smaller than one MIDI step as a change', () => {
    hold(report([layer({ level: 0.5 })]), 0, IDLE_PAUSE_MS - HEARTBEAT_MS);
    tracker.report(report([layer({ level: 0.5 + STEP / 4 })]), IDLE_PAUSE_MS);
    expect(tracker.paused()).toBe(true);
  });

  it('ends open Spans at the last report when reports are lost', () => {
    tracker.report(report([layer()]), 0);
    tracker.report(report([layer()]), HEARTBEAT_MS);
    const back = HEARTBEAT_MS + LOST_REPORT_MS + SECOND;
    tracker.report(report([layer()]), back);
    expect(spans).toEqual([
      expect.objectContaining({ from: 0, to: HEARTBEAT_MS }),
      expect.objectContaining({ from: back, to: back }),
    ]);
    expect(schemeSpans).toHaveLength(2);
  });

  it('opens a Scheme span only while a Layer is on', () => {
    tracker.report(report([layer({ level: 0 })], 'Colors/Red'), 0);
    expect(schemeSpans).toEqual([]);

    tracker.report(report([layer()], 'Colors/Red'), SECOND);
    tracker.report(report([layer()], 'Colors/Blue'), 2 * SECOND);
    tracker.report(report([layer({ level: 0 })], 'Colors/Blue'), 3 * SECOND);
    tracker.report(report([layer({ level: 0 })], 'Colors/Green'), 4 * SECOND);
    expect(schemeSpans).toEqual([
      { path: 'Colors/Red', from: SECOND, to: 2 * SECOND },
      { path: 'Colors/Blue', from: 2 * SECOND, to: 3 * SECOND },
    ]);
  });

  it('keeps the Scheme span open while a Layer plays an untracked Tox', () => {
    tracker.report(report([layer({ activeScene: BLANK })]), 0);
    expect(spans).toEqual([]);
    expect(schemeSpans).toHaveLength(1);
  });

  it('closes what is open when stopped', () => {
    tracker.report(report([layer()]), 0);
    tracker.stop(5 * SECOND);
    expect(spans[0]!.to).toBe(5 * SECOND);
    expect(schemeSpans[0]!.to).toBe(5 * SECOND);
  });

  it('stops at the last report when the reports were already lost', () => {
    tracker.report(report([layer()]), 0);
    tracker.stop(LOST_REPORT_MS + SECOND);
    expect(spans[0]!.to).toBe(0);
  });
});
