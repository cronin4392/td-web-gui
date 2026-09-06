# vj-gui

The author's real VJ rig: twelve scene layers driven from the web, SQLite
catalogs of scenes and effects, and a wordbank of phrases pushed to a layer's
text params. Not published — but maintained and tested, not a scratchpad.

## Speak the ubiquitous language

`UBIQUITOUS_LANGUAGE.md` in this directory is canonical. **Read it before naming
anything.** Scene, Effect, Tox, Group, Layer, Loader, Catalog, Sync, Scan, Tag,
Rank, Wordbank, Phrase list, Phrase, Recent — each has one meaning here, and the
"Aliases to avoid" columns are the names that keep creeping back in.

Its **Flagged ambiguities** section lists where the code still disagrees with
itself, and which of those are deliberate. Notably: `src/playback/wire.ts` is the
one file where the legacy `scene*` wire vocabulary is allowed, because that
spelling is TouchDesigner's contract, not this app's to rename. Don't "fix" it
elsewhere, and don't spread it.

These terms stop at this directory. Never carry them into `packages/td-core`.

## Three tiers, three tsconfigs

| Directory | Runs in                        | Config                 |
| --------- | ------------------------------ | ---------------------- |
| `src/`    | Browser                        | `tsconfig.json`        |
| `server/` | Node (Vite dev/preview server) | `tsconfig.server.json` |
| `domain/` | Both                           | `tsconfig.domain.json` |

`domain/` is the shared kernel — types, validators, and derivations used on both
sides so a scan and a DB read can't disagree. It must stay free of Node APIs and
of DOM APIs alike. `pnpm typecheck` runs all three; a change to `domain/` that
only typechecks under one of them is broken.

Imports use `@/*` for `src/` and `@domain/*` for `domain/`.

## The browser is the latest Chrome

One machine, one browser, kept current. Target the latest stable Chrome: no
polyfills, no vendor prefixes, no fallbacks for older engines. A platform
feature is fair game the day Chrome ships it — `text-box`, `color-mix()`,
`:has()`, native nesting and `@layer` are already load-bearing here.

This stops at this directory. `packages/td-core` and `apps/example` are
published, and what they support is not this app's call.

## The server is Vite plugins, not a separate service

`server/*/**-api-plugin.ts` mount as Vite middleware (see `vite.config.ts`), so
there is no server to start separately — `pnpm --filter vj-gui dev` is the whole
thing. They read SQLite through `node:sqlite`.

- `data/*.db` is **untracked**; `data/snapshots/*.sql` is the tracked copy. A
  catalog holds authored state a Sync cannot rederive, but the live file is
  rewritten as you work — tracking it left `git status` unable to separate an
  edit from a background write, and turned every stash and checkout into a fight
  with a moving, often reader-locked binary.
- **A fresh clone has no `.db` at all, so `dev` restores one.** `predev` (and
  `prepreview`) run `db:restore --if-missing`, which fills in absent databases and
  leaves existing ones alone, quietly and without failing on the second run.
  Nothing else is load-bearing enough to restore for you: `catalogDbPath`'s guard
  can't catch this case, because `data/snapshots/` is tracked and so is present in
  every clone.
- **`folder` is stored relative to the content root, never absolute** — in the
  `.db` as well as the Snapshot, so no machine's `.env` leaks into a tracked
  file. The absolute path is derived, not stored: `readScenes` / `readEffects`
  join the row against `VJ_SCENES_ROOT` / `VJ_EFFECTS_ROOT` from `.env`, and a
  Scan writes only the part below the root. A restored catalog resolves a Tox
  straight away; a Sync is for picking up what changed on disk, not for fixing
  up paths. `db:export`'s `--strip` now only guards a `.db` written before this.
- **`pnpm db:export` is manual by design and stays that way.** Nothing runs it
  for you, so an unexported change is an unbacked-up one. It refuses rather than
  write nothing over a good snapshot: once for a database that isn't there, and
  once for any table that is empty while the snapshot still holds rows for it —
  the state the server leaves when it seeds a catalog before anything was
  restored. The check is per table, so a wiped `scenes` is caught even while
  `scene_tags` still has rows. `--force` overrides it when the emptying was
  deliberate.
- **The destructive direction is guarded too.** `pnpm db:restore` will not
  overwrite an existing `.db` without `--force`, and `--force` itself refuses one
  whose contents differ from its snapshot — export first, or say
  `--discard-changes`. That comparison runs through the same `--strip` roots the
  export used, which is why both scripts pass them.
- Snapshots are byte-deterministic — no timestamp header, rows ordered by primary
  key. A re-export with nothing changed produces no diff, which is the only
  reason the diffs are worth reading. Don't add anything per-run to them.
- `-wal`/`-shm` are still machine-local and still ignored. `db:restore` deletes
  them when it replaces a file: a journal left from the old database replays into
  whatever takes its place and silently undoes the restore.
- `checkpointWal` on every write path predates this and was justified by keeping
  `git status` honest. That reason is gone; it is now only about readers outside
  SQLite seeing recent writes. `pnpm db:checkpoint` still folds a log by hand,
  and nothing enforces it on commit any more.
- The scripts themselves live in `scripts/`, and their suites run with this app's
  — `pnpm test` here covers them. They are plain `node` CLIs, so each test file
  opts out of the jsdom default with a `@vitest-environment node` docblock.
- Content roots come from `.env` (`VJ_SCENES_ROOT`, `VJ_EFFECTS_ROOT`); see
  `.env.example`. Those paths never reach the browser.
- Vite's watcher deliberately ignores `data/**` — SQLite's `-wal`/`-shm` writes
  would otherwise reload the page on every mutation.

## The TouchDesigner side

`td/gui-config.py` is the GUI project's config (port 8765). `td/scene-config.py`
is shared by **all twelve** scene processes — same file, twelve `WebGuiServer`
components, differing only in their `Identifier` and `Port` parameters. That's
why no wire name in it is scene-prefixed: a name is scoped to its instance.
`td/input-config.py` is the Input project's config (port 8766) — the rig's MIDI
and audio front end.

No port is chosen on this side: the web-side defaults are copies of the
`ExternalPorts` tool in the TouchDesigner project, which every `.toe` reads its
own ports from, so a port moves there first.

The TypeScript counterpart of all three is `src/playback/wire.ts`. Each pair
must agree spelling-for-spelling; nothing checks it.

Loading a scene bypasses parameters entirely — the web calls each SceneLoader
process directly rather than going through the GUI project.

## Testing

Tests live beside their subject. Server plugins run against a temp SQLite file;
stores and pickers against fakes. Don't re-test `td-core` here — that's the
library's own suite.
