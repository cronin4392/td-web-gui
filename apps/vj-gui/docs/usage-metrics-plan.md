# Usage metrics — plan

Track how long each Scene, Effect and Color scheme is actually on during a
performance, so the pickers can sort by how much they get used — all-time, with
recent Shows weighted higher so a new favourite ranks high quickly.

Status: implemented.

Nothing on the TouchDesigner side or in `td-core` changes. Every value this
needs is already on the wire: each Loader's `level`, `activeScene`, `layout`
and `color`, and the Input project's `activeColorScheme`.

## Terms

These are in `UBIQUITOUS_LANGUAGE.md`, which is now the canonical copy.

| Term            | Definition                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Live mode**   | Whether usage is being tracked. Held in the dev server's memory, so it is off whenever the node process starts              |
| **Show**        | One Live mode session. Turning Live mode on within an hour of the last Show ending continues that Show                      |
| **Span**        | One stored row: one Tox on one Layer, with one layout and one color, while the Layer is on                                  |
| **Scheme span** | One stored row: one Color scheme active while at least one Layer is on                                                      |
| **Play**        | Back-to-back Spans of the same Tox on the same Layer, joined across gaps of up to 10 s. Derived at query time, never stored |
| **Usage score** | The decayed weight of an entry's Plays. Derived at query time, never stored                                                 |
| **Idle pause**  | Tracking suspended after 5 minutes with no change; resumes on the next change                                               |

## When a row is written

A Layer is **on** when `level >= 2/127` — one MIDI step above zero still counts
as off, guarding against a controller that sticks just short of the bottom.

- A Span **opens** when a Layer goes on with a tracked Tox loaded.
- A Span **closes** when the Layer goes off, or when its Tox, layout or color
  changes while it is on — a change while on also opens the next Span at once.
- Changes made while a Layer is off — loads, layout, color — record nothing.
- The 15 s heartbeat only extends the open Span's `ended_at`. It never adds a row.
- A Tox under neither `VJ_SCENES_ROOT` nor `VJ_EFFECTS_ROOT` is not tracked.
  Nor is the Loader's blank Tox, `0Blank`: it sits under the scenes root, so it
  is left out by name.
- Z layers are recorded like any other Layer. They still report a layout and a
  color (`normal`/`normal`); only the GUI hides them.

A Scheme span opens when a Color scheme becomes active while any Layer is on,
and closes when the scheme changes or the last Layer goes off.

### Worked example (one Layer)

| Time      | Action                               | Database                                           | Play                |
| --------- | ------------------------------------ | -------------------------------------------------- | ------------------- |
| 0:00      | Load scene X, level at 0             | nothing                                            | —                   |
| 0:20      | Switch layout to Split X, still at 0 | nothing                                            | —                   |
| 0:30      | Raise the fader                      | **row 1**: X, Split X, Normal, from 0:30           | 1                   |
| 0:30–2:00 | Hold                                 | row 1's `ended_at` advances every 15 s             | 1                   |
| 2:00      | Switch color to Edge                 | row 1 ends; **row 2**: X, Split X, Edge, from 2:00 | 1                   |
| 3:00–3:10 | Fade down to ~20%, back up           | nothing — never below 2/127, row 2 continues       | 1                   |
| 3:30      | Fade fully out                       | row 2 ends                                         | 1                   |
| 3:36      | Fade back in                         | **row 3**: X, Split X, Edge, from 3:36             | 1 (6 s gap ≤ 10 s)  |
| 4:00      | Fade fully out                       | row 3 ends                                         | 1                   |
| 4:40      | Fade back in                         | **row 4**: X, Split X, Edge, from 4:40             | 2 (40 s gap > 10 s) |
| 5:00      | Load scene Y while on                | row 4 ends; **row 5**: Y, from 5:00                | 3                   |
| 6:00      | Clear layer                          | row 5 ends; the blank Tox isn't tracked            | —                   |

Play durations count on-time only, not the gaps: Play 1 is 3:24, Play 2 is
0:20, Play 3 is 1:00.

### Idle pause

After 5 minutes with no change, every open Span and Scheme span closes at the
5-minute mark (those 5 minutes count), and nothing is written until the next
change opens fresh ones. A change is: a load, a `level` move of at least one
MIDI step (1/127), a layout, color or Color scheme change.

A fresh row that reopens what the pause closed — the same Tox on the same Layer,
or the same Color scheme — is written with `resumed = 1`, and the Play query
joins it back into one Play however long the pause ran. Only the first report
after the pause can set it: a Tox that had gone off by then and came back later
starts a new Play, and so does one whose reports were lost during the pause.
The flag is written rather than inferred because the rows alone cannot tell a
pause from a fade-out.

### Lost reports

If no report arrives for 90 s (tab closed, browser crashed), open spans end at
the last report. Not 30 s: Chrome throttles a hidden page's timers to one a
minute, and a late heartbeat must not read as a lost one.

A report says what one page can see. A Layer it leaves out, or an empty Color
scheme, is a Loader that page has not synced yet — no information, not "off" —
so its row is neither extended nor closed, and ends at the last report that
mentioned it once that is 90 s old. This is what keeps a page reload, a Loader
that drops for a moment, or a second tab with fewer Loaders connected from
splitting rows.

## What is fixed at write time vs. tunable later

| Fixed when the row is written | Query-time parameter — change it and every score recomputes |
| ----------------------------- | ----------------------------------------------------------- |
| Off level (2/127)             | Play gap (10 s)                                             |
| What splits a Span            | Minimum Play length (3 s)                                   |
| Idle pause (5 min)            | Minimum Color scheme use (10 s)                             |
| Which rows are `resumed`      | Half-life (5 Shows)                                         |

## Storage: `data/usage.db`

A separate database. SQLite foreign keys can't cross files, and a key into
`scenes.db` would either erase history when a Sync prunes a scene (cascade) or
stop the Sync pruning at all. Writing to a catalog mid-Show would also leave it
permanently different from its Snapshot. Entries are joined to the catalogs by
`name` at sort time.

```sql
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
CREATE INDEX spans_by_entry ON spans (kind, name);
CREATE TABLE scheme_spans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  show_id    INTEGER NOT NULL REFERENCES shows(id),
  path       TEXT NOT NULL,     -- the Color scheme's identity on the wire
  started_at INTEGER NOT NULL,
  ended_at   INTEGER NOT NULL,
  resumed    INTEGER NOT NULL DEFAULT 0
);
```

Volume is a non-issue: a few thousand Spans per Show, under a million after a
hundred Shows. The one way to make it an issue is storing `level` samples
instead of Spans.

### Snapshot

`usage.db` joins the other databases in `db:export`, `db:restore` and
`db:checkpoint`, so it gets `data/snapshots/usage.sql` and is restored by
`predev` on a fresh clone. Ids only grow and the Snapshot is ordered by primary
key, so each export appends lines — the diff reads as what was played. Export
stays manual like the rest. The repo being public is accepted.

## Server — `server/usage/`

- **`usage-db.ts`** — opens through `catalogDbPath('VJ_USAGE_DB', 'usage.db')`
  and `requireRestoredDb`, like the other databases. The env override is how
  tests get a temp file.
- **`tracker.ts`** — pure logic, no HTTP; where most tests live. Takes a report
  (every Layer's `activeScene`, `level`, `layout`, `color`, plus
  `activeColorScheme`) and the current time; returns the spans to open, extend
  or close. Classifies scene vs effect by matching `activeScene` against the
  two content roots (which never reach the browser), and derives the name the
  same way `activeSceneName` does. Reports carry state, not events, so two open
  tabs sending the same report produce one Span — and a tab that turns Live
  mode on is followed by every other open tab, which poll `GET /live`.
- **`usage-api-plugin.ts`** — mounted in `vite.config.ts`.

| Route                    | Does                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `GET /api/usage/live`    | `{ on, paused }`                                                 |
| `POST /api/usage/live`   | `{ on }` — turns Live mode on/off, starting or continuing a Show |
| `POST /api/usage/report` | `{ layers, activeColorScheme }` — ignored while Live mode is off |
| `GET /api/usage/scores`  | `?kind=scene\|effect\|scheme` → `{ [name or path]: score }`      |

A second dev server sharing the database starts with Live mode off, so it never
writes.

## Scoring — `domain/usage/score.ts`

Pure functions, tested on their own.

```
play value = minutes on
weight     = play value × 0.5^(shows ago / half-life)
score      = Σ weight over Plays of at least 3 s
```

- A score is time on and nothing else: two Plays of 10 s score the same as one
  of 20 s, so an entry reached for often does not outrank one left up for as
  long. `playValue` is the one function to change to weigh Plays differently —
  the Plays are still derived, so a per-Play bonus or diminishing returns can
  come back without touching what is stored.
- "Shows ago" counts Shows, not days — the newest Show is 0 — so a month off
  doesn't fade everything.
- SQL joins Spans into Plays (`LAG()` over `(layer, kind, name)` ordered by
  `started_at`, gap ≤ 10 s or `resumed`) and tags each with its Show index;
  TypeScript applies the formula.
- Scheme spans score the same way: spans of one Color scheme join across gaps
  of up to 10 s, counting on-time only. Their minimum is **10 s**, not 3 s, so
  flipping through schemes to find one doesn't credit the ones passed over —
  even when each is looked at for a few seconds.

| Time      | Active scheme | Scheme span | Scored as                                            |
| --------- | ------------- | ----------- | ---------------------------------------------------- |
| 0:00–1:00 | A             | A, 60 s     | A's use begins                                       |
| 1:00–1:04 | B             | B, 4 s      | under 10 s, ignored                                  |
| 1:04–1:09 | C             | C, 5 s      | under 10 s, ignored                                  |
| 1:09–5:00 | back to A     | A, 3:51     | 9 s gap ≤ 10 s, joins: **one use of A**, on for 4:51 |

## Client — `src/usage/`

- **`UsageReporter`** — reads each Layer's `level`, `activeScene`, `layout`,
  `color` and the Input project's `activeColorScheme`. Reduces `level` to on/off
  (and whole MIDI steps for idle detection) before deciding anything changed, so
  fader travel alone doesn't post. Posts on change and every 15 s while Live mode
  is on.
- **Live mode toggle** in the Status bar, showing off / tracking / paused.
- **A Usage sort mode** in the Scene picker (beside Rank, within the current
  Tag), the Effect picker (beside name order) and the Color picker (within each
  Color group tab). Scores are fetched when a picker opens.

## Tests

- `tracker` — open/close on the off level; split on Tox, layout and color
  change; nothing recorded while off; duplicate reports make one Span; Idle
  pause closes at the 5-minute mark and resumes; lost reports end Spans;
  untracked paths ignored; Scheme spans only while a Layer is on.
- `score` — the weight curve, the decay, the minimum Play length, and the
  10 s Color scheme minimum against a flip-through.
- The Play query against a temp database — gap joining, rejoining across an
  Idle pause, on-time-only durations.
- Plugin routes, through the existing `api-plugin.test-helpers`.

## Build order

1. `usage.db`, `tracker`, the report and live routes, snapshot script wiring.
2. `UsageReporter` and the Live mode toggle.
3. Scoring and the Usage sort modes.

## Deferred

- **Rename keeps history.** A Scene has no identity beyond its folder name, so
  a rename on disk reads to a Sync as delete + add — already true for Tags and
  Hidden. The fix is a Rename entry in the Context menu that moves the catalog
  row, Tags and Spans together.
