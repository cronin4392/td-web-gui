PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE shows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,  -- epoch ms, UTC
    ended_at   INTEGER NOT NULL
  );
CREATE TABLE spans (
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
CREATE TABLE scheme_spans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id    INTEGER NOT NULL REFERENCES shows(id),
    path       TEXT NOT NULL,     -- the Color scheme's identity on the wire
    started_at INTEGER NOT NULL,
    ended_at   INTEGER NOT NULL,
    resumed    INTEGER NOT NULL DEFAULT 0
  );
CREATE INDEX spans_by_entry ON spans (kind, name);
COMMIT;
