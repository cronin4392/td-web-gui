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

- `data/*.db` is **tracked**; its `-wal`/`-shm` journals are not. A catalog holds
  authored state a Sync cannot rederive, so the file is the only copy of it —
  `pnpm db:scenes` / `pnpm db:effects` rebuild the scanned columns around it.
- **A write only counts once its WAL is checkpointed**, which is why every write
  path calls `checkpointWal`. In WAL mode a committed transaction sits in
  `data/*.db-wal`, where nothing outside SQLite can see it: the `.db` staged
  without it opens cleanly, passes `integrity_check`, and is quietly missing it,
  and `git status` calls a database whose every tag just changed unmodified.
  Checkpointing on each write is what keeps `git status` honest; the pre-commit
  hook re-runs `scripts/checkpoint-sqlite.mjs` on any staged `.db` and fails the
  commit if it cannot get a clean one, and `pnpm db:checkpoint` does it by hand.
  Nothing else in the repo makes this class of mistake loud, so don't route
  around either.
- A tracked `.db` shows as modified more often than its contents change —
  SQLite reuses pages, so a round trip that ends where it started still rewrites
  the file. Check what actually moved before committing one; the diff cannot.
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
