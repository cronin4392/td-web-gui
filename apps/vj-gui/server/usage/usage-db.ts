import type { DatabaseSync } from 'node:sqlite';
import {
  MIN_PLAY_MS,
  MIN_SCHEME_USE_MS,
  PLAY_GAP_MS,
  usageScores,
  type Play,
} from '../../domain/usage/score';
import {
  SHOW_CONTINUES_WITHIN_MS,
  type ToxKind,
  type LayerScores,
  type UsageKind,
  type UsageScores,
} from '../../domain/usage/usage';
import { catalogDbPath, openCatalogDb, type TableColumns } from '../platform/catalog-db';
import type { SpanSink } from './tracker';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS shows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,  -- epoch ms, UTC
    ended_at   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id    INTEGER NOT NULL REFERENCES shows(id),
    kind       TEXT NOT NULL CHECK (kind IN ('scene', 'effect')),
    name       TEXT NOT NULL,
    layer      TEXT NOT NULL,
    layout     TEXT NOT NULL,
    color      TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL,
    resumed    INTEGER NOT NULL DEFAULT 0  -- 1: reopens the row an Idle pause closed
  );
  CREATE INDEX IF NOT EXISTS spans_by_entry ON spans (kind, name);
  CREATE TABLE IF NOT EXISTS scheme_spans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id    INTEGER NOT NULL REFERENCES shows(id),
    path       TEXT NOT NULL,     -- the Color scheme's identity on the wire
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL,
    resumed    INTEGER NOT NULL DEFAULT 0
  );
`;

const RESUMED = 'INTEGER NOT NULL DEFAULT 0';
const COLUMNS: TableColumns = {
  shows: { id: '', started_at: '', ended_at: '' },
  spans: {
    id: '',
    show_id: '',
    kind: '',
    name: '',
    layer: '',
    layout: '',
    color: '',
    started_at: '',
    ended_at: '',
    resumed: RESUMED,
  },
  scheme_spans: { id: '', show_id: '', path: '', started_at: '', ended_at: '', resumed: RESUMED },
};

export function usageDbPath(): string {
  return catalogDbPath('VJ_USAGE_DB', 'usage.db');
}

// `SCHEMA` drops nothing, so history is never rebuilt away — and drift a new column cannot mend is refused, not written into.
export function openUsageDb(path: string): DatabaseSync {
  const db = openCatalogDb(path, COLUMNS, SCHEMA);
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const live = db.prepare('SELECT name FROM pragma_table_info(?)').all(table);
    const names = new Set(live.map((column) => String(column.name)));
    const missing = Object.keys(columns).filter((name) => !names.has(name));
    if (missing.length === 0) continue;
    db.close();
    throw new Error(
      `${path}: table ${table} lacks ${missing.join(', ')} — not a usage database this version can write`,
    );
  }
  return db;
}

export function startShow(db: DatabaseSync, now: number): number {
  const last = db.prepare('SELECT id, ended_at FROM shows ORDER BY id DESC LIMIT 1').get() as
    { id: number; ended_at: number } | undefined;
  if (last && now - last.ended_at <= SHOW_CONTINUES_WITHIN_MS) {
    extendShow(db, last.id, now);
    return last.id;
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO shows (started_at, ended_at) VALUES (?, ?)')
    .run(now, now);
  return Number(lastInsertRowid);
}

export function extendShow(db: DatabaseSync, show: number, now: number): void {
  db.prepare('UPDATE shows SET ended_at = ? WHERE id = ?').run(now, show);
}

export function spanSink(db: DatabaseSync, show: number): SpanSink {
  const openSpan = db.prepare(
    `INSERT INTO spans (show_id, kind, name, layer, layout, color, started_at, ended_at, resumed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const endSpan = db.prepare('UPDATE spans SET ended_at = ? WHERE id = ?');
  const openSchemeSpan = db.prepare(
    'INSERT INTO scheme_spans (show_id, path, started_at, ended_at, resumed) VALUES (?, ?, ?, ?, ?)',
  );
  const endSchemeSpan = db.prepare('UPDATE scheme_spans SET ended_at = ? WHERE id = ?');
  return {
    openSpan: (span, at, resumed) =>
      Number(
        openSpan.run(
          show,
          span.kind,
          span.name,
          span.layer,
          span.layout,
          span.color,
          at,
          at,
          resumed ? 1 : 0,
        ).lastInsertRowid,
      ),
    endSpan: (id, at) => void endSpan.run(at, id),
    openSchemeSpan: (path, at, resumed) =>
      Number(openSchemeSpan.run(show, path, at, at, resumed ? 1 : 0).lastInsertRowid),
    endSchemeSpan: (id, at) => void endSchemeSpan.run(at, id),
  };
}

function playsSql(rows: { from: string; partition: string; key: string }): string {
  return `
    WITH marked AS (
      SELECT *,
             CASE
               WHEN resumed = 1 THEN 0
               WHEN started_at - LAG(ended_at) OVER entry <= $gap THEN 0
               ELSE 1
             END AS begins
        FROM ${rows.from}
      WINDOW entry AS (PARTITION BY ${rows.partition} ORDER BY started_at, id)
    ),
    numbered AS (
      SELECT *,
             SUM(begins) OVER (PARTITION BY ${rows.partition} ORDER BY started_at, id) AS play
        FROM marked
    ),
    plays AS (
      SELECT ${rows.key} AS key, MAX(show_id) AS show_id, MIN(started_at) AS started_at,
             SUM(ended_at - started_at) AS on_ms
        FROM numbered
       GROUP BY ${rows.partition}, play
    )
    SELECT plays.key, plays.on_ms AS onMs,
           (SELECT COUNT(*) FROM shows WHERE shows.id > plays.show_id) AS showsAgo
      FROM plays
     ORDER BY plays.started_at, plays.key
  `;
}

const toxPlaysSql = (kind: ToxKind) =>
  playsSql({
    from: `(SELECT * FROM spans WHERE kind = '${kind}')`,
    partition: 'layer, name',
    key: 'name',
  });
const SCHEME_USES_SQL = playsSql({ from: 'scheme_spans', partition: 'path', key: 'path' });
const LAYER_PLAYS_SQL = playsSql({
  from: 'spans',
  partition: 'layer, kind, name',
  key: 'json_array(layer, kind, name)',
});

export interface PlayQuery {
  gapMs?: number;
}

function playsFrom(db: DatabaseSync, sql: string, query: PlayQuery): Play[] {
  const rows = db.prepare(sql).all({ $gap: query.gapMs ?? PLAY_GAP_MS });
  return rows.map((row) => ({
    key: String(row.key),
    onMs: Number(row.onMs),
    showsAgo: Number(row.showsAgo),
  }));
}

export function readPlays(db: DatabaseSync, kind: UsageKind, query: PlayQuery = {}): Play[] {
  return playsFrom(db, kind === 'scheme' ? SCHEME_USES_SQL : toxPlaysSql(kind), query);
}

export function readScores(db: DatabaseSync, kind: UsageKind): UsageScores {
  return usageScores(readPlays(db, kind), {
    minMs: kind === 'scheme' ? MIN_SCHEME_USE_MS : MIN_PLAY_MS,
  });
}

export function readLayerScores(db: DatabaseSync): LayerScores {
  const scores = usageScores(playsFrom(db, LAYER_PLAYS_SQL, {}), { minMs: MIN_PLAY_MS });
  const layers: LayerScores = {};
  for (const [key, score] of Object.entries(scores)) {
    const [layer, kind, name] = JSON.parse(key) as [string, ToxKind, string];
    (layers[layer] ??= []).push({ kind, name, score });
  }
  for (const entries of Object.values(layers)) {
    entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
  return layers;
}
