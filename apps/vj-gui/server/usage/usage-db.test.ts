// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDLE_PAUSE_MS, SHOW_CONTINUES_WITHIN_MS } from '../../domain/usage/usage';
import { openUsageDb, readPlays, readScores, spanSink, startShow } from './usage-db';
import type { SpanFields, SpanSink } from './tracker';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const X: SpanFields = { kind: 'scene', name: 'X', layer: 'A', layout: 'normal', color: 'normal' };

let dir: string;
let db: DatabaseSync;
let sink: SpanSink;

function span(
  fields: Partial<SpanFields>,
  from: number,
  to: number,
  { into = sink, resumed = false } = {},
): void {
  into.endSpan(into.openSpan({ ...X, ...fields }, from, resumed), to);
}

function schemeSpan(path: string, from: number, to: number, resumed = false): void {
  sink.endSchemeSpan(sink.openSchemeSpan(path, from, resumed), to);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-usage-db-'));
  db = openUsageDb(join(dir, 'usage.db'));
  sink = spanSink(db, startShow(db, 0));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('startShow', () => {
  it('continues the last Show within the hour and starts a new one after it', () => {
    const first = startShow(db, 0);
    expect(startShow(db, SHOW_CONTINUES_WITHIN_MS)).toBe(first);
    expect(startShow(db, 2 * SHOW_CONTINUES_WITHIN_MS + 1)).not.toBe(first);
  });
});

describe('readPlays', () => {
  it('joins the worked example’s Spans into three Plays, counting time on only', () => {
    const at = (minutes: number, seconds: number) => (minutes * 60 + seconds) * SECOND;
    span({}, at(0, 30), at(2, 0));
    span({ color: 'edge' }, at(2, 0), at(3, 30));
    span({ color: 'edge' }, at(3, 36), at(4, 0));
    span({ color: 'edge' }, at(4, 40), at(5, 0));
    span({ name: 'Y' }, at(5, 0), at(6, 0));

    expect(readPlays(db, 'scene')).toEqual([
      { key: 'X', showsAgo: 0, onMs: at(3, 24) },
      { key: 'X', showsAgo: 0, onMs: at(0, 20) },
      { key: 'Y', showsAgo: 0, onMs: at(1, 0) },
    ]);
  });

  it('never joins across Layers or kinds', () => {
    span({}, 0, 5 * SECOND);
    span({ layer: 'B' }, 6 * SECOND, 10 * SECOND);
    span({ kind: 'effect' }, 11 * SECOND, 15 * SECOND);

    expect(readPlays(db, 'scene')).toHaveLength(2);
    expect(readPlays(db, 'effect')).toEqual([{ key: 'X', showsAgo: 0, onMs: 4 * SECOND }]);
  });

  it('rejoins a Tox that stayed on through an Idle pause', () => {
    const resumed = IDLE_PAUSE_MS + 20 * MINUTE;
    span({}, 0, IDLE_PAUSE_MS);
    schemeSpan('Colors/Red', 0, IDLE_PAUSE_MS);
    span({}, resumed, resumed + MINUTE, { resumed: true });
    schemeSpan('Colors/Red', resumed, resumed + MINUTE, true);

    expect(readPlays(db, 'scene')).toEqual([
      { key: 'X', showsAgo: 0, onMs: IDLE_PAUSE_MS + MINUTE },
    ]);
    expect(readPlays(db, 'scheme')).toEqual([
      { key: 'Colors/Red', showsAgo: 0, onMs: IDLE_PAUSE_MS + MINUTE },
    ]);
  });

  it('keeps a Tox that came back after a long gap as a second Play', () => {
    span({}, 0, IDLE_PAUSE_MS);
    span({}, IDLE_PAUSE_MS + 20 * MINUTE, IDLE_PAUSE_MS + 21 * MINUTE);

    expect(readPlays(db, 'scene')).toHaveLength(2);
  });

  it('counts Shows ago from the newest Show', () => {
    span({}, 0, MINUTE);
    const later = 3 * SHOW_CONTINUES_WITHIN_MS;
    span({}, later, later + MINUTE, { into: spanSink(db, startShow(db, later)) });
    startShow(db, 3 * later);

    expect(readPlays(db, 'scene').map((play) => play.showsAgo)).toEqual([2, 1]);
  });

  it('joins a Color scheme’s uses across a flip through others', () => {
    const at = (minutes: number, seconds: number) => (minutes * 60 + seconds) * SECOND;
    schemeSpan('A', at(0, 0), at(1, 0));
    schemeSpan('B', at(1, 0), at(1, 4));
    schemeSpan('C', at(1, 4), at(1, 9));
    schemeSpan('A', at(1, 9), at(5, 0));

    expect(readPlays(db, 'scheme')).toEqual([
      { key: 'A', showsAgo: 0, onMs: at(4, 51) },
      { key: 'B', showsAgo: 0, onMs: at(0, 4) },
      { key: 'C', showsAgo: 0, onMs: at(0, 5) },
    ]);
    expect(Object.keys(readScores(db, 'scheme'))).toEqual(['A']);
  });

  it('recomputes under a different Play gap', () => {
    span({}, 0, 5 * SECOND);
    span({}, 45 * SECOND, 50 * SECOND);

    expect(readPlays(db, 'scene')).toHaveLength(2);
    expect(readPlays(db, 'scene', { gapMs: MINUTE })).toHaveLength(1);
  });
});

describe('readScores', () => {
  it('scores each entry by name, leaving out Plays under the minimum', () => {
    span({}, 0, MINUTE);
    span({ name: 'Y' }, 2 * MINUTE, 2 * MINUTE + SECOND);

    expect(readScores(db, 'scene')).toEqual({ X: 1 });
  });
});

describe('openUsageDb', () => {
  it('adds the resumed column to a database written before it, keeping its rows', () => {
    span({}, 0, MINUTE);
    db.exec('ALTER TABLE spans DROP COLUMN resumed');
    db.exec('ALTER TABLE scheme_spans DROP COLUMN resumed');
    db.close();

    db = openUsageDb(join(dir, 'usage.db'));
    expect(db.prepare('SELECT name, resumed FROM spans').all()).toEqual([
      { name: 'X', resumed: 0 },
    ]);
    expect(db.prepare('SELECT resumed FROM scheme_spans').all()).toEqual([]);
  });

  it('refuses a database whose tables it cannot write', () => {
    db.exec('ALTER TABLE spans ADD COLUMN legacy TEXT');
    db.exec('ALTER TABLE spans DROP COLUMN resumed');
    db.close();

    expect(() => openUsageDb(join(dir, 'usage.db'))).toThrow(/spans lacks resumed/);
    db = openUsageDb(join(dir, 'other.db'));
  });
});
