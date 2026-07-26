# td-web-gui

Development workspace for **[`td-core`](packages/td-core)** — a Solid.js library
for building web UIs that control [TouchDesigner](https://derivative.ca/), with
bidirectional parameters over WebSocket and real-time video over WebRTC.

**→ [Package README and documentation](packages/td-core#readme)**

If you're here to *use* the library, everything you need is in that package.
This file covers working on it.

## Layout

| | |
|---|---|
| [`packages/td-core`](packages/td-core) | The library — the deliverable. Ships the TouchDesigner-side Python in [`touchdesigner/`](packages/td-core/touchdesigner) and its docs in [`docs/`](packages/td-core/docs). |
| [`apps/example`](apps/example) | Example Solid app exercising every control and an 8-tile video wall. Distributed alongside the package. |
| [`td/`](td) | Reference TouchDesigner project (`Example.toe`) driving the example app. |
| `apps/vj-gui` | A scratch app. Not distributed, not maintained. |

## Prerequisites

- **Node.js** ≥ 24
- **pnpm** (`npm install -g pnpm`)
- **TouchDesigner** 2025.33070 to run anything end-to-end

## Commands

```sh
pnpm install                      # install all workspace dependencies

pnpm --filter td-core build       # build the library -> dist/ (JSX-preserving + .d.ts)
pnpm --filter td-core test        # run the test suite once
pnpm --filter td-core test:watch  # watch mode
pnpm --filter td-core typecheck   # type-check without emitting

pnpm --filter example dev         # start the example app (Vite)
pnpm --filter example build       # production-build the example app
```

Workspace-wide: `pnpm build`, `pnpm test`, `pnpm typecheck`.

> The example app imports `td-core` from its built `dist/`, so run
> `pnpm --filter td-core build` before `pnpm --filter example dev`.

## Running end-to-end

1. `pnpm --filter td-core build`
2. Open [`td/Example.toe`](td) in TouchDesigner
3. `pnpm --filter example dev`

`td/config-example.py` is the reference project's registry; it expects a
`/project1/params` Base COMP with one custom parameter per entry, plus the video
wall under `/project1/videowall`. The file's docstring lists exactly what.

The TouchDesigner callbacks the reference project loads live in the package now
(`packages/td-core/touchdesigner/`), so the `.toe` consumes them the same way a
user's project would.

## Testing

`td-core` is tested against an in-memory TouchDesigner — a stub WebSocket server
and a faked `RTCPeerConnection` — so the full wire contract runs in CI without a
live `.toe`. The reference project is the manual check for what can't be faked:
real WebRTC media, and reconnect on a `.toe` reload.

The TouchDesigner-side Python currently has **no automated coverage**; see
[TODO.md](TODO.md).

## Design documentation

The library's design rationale is documented formally in the package:

- [Wire protocol](packages/td-core/docs/protocol.md)
- [Design notes](packages/td-core/docs/design-notes.md) — including TouchDesigner
  behavior that contradicts the obvious assumption

`prds/` holds the original planning documents. They are historical, superseded by
the docs above, and slated for removal.
