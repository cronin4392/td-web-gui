# TD Web GUI

Web UI that communicates bidirectionally with TouchDesigner — control data (text, numbers, messages) over WebSocket and real-time video over WebRTC.

This is a pnpm workspace monorepo:

- [`packages/td-core`](packages/td-core) — the reusable Solid.js library (the deliverable).
- [`apps/example`](apps/example) — example Solid app that consumes `td-core` end-to-end.

See [prds/TECH_PROPOSAL.md](prds/TECH_PROPOSAL.md) for the design and [prds/TASKS.md](prds/TASKS.md) for the implementation plan.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (`npm install -g pnpm`)

## Commands

Run from the repo root.

```sh
pnpm install                      # install all workspace dependencies

pnpm --filter td-core build       # build the library -> packages/td-core/dist (JSX-preserving + .d.ts)
pnpm --filter td-core test        # run the td-core test suite once
pnpm --filter td-core test:watch  # run td-core tests in watch mode

pnpm --filter example dev         # start the example app dev server (Vite)
pnpm --filter example build       # production-build the example app
```

> The example app imports `td-core` from its built `dist/`, so run `pnpm --filter td-core build` before `pnpm --filter example dev`.

Workspace-wide shortcuts:

```sh
pnpm build       # build every package
pnpm test        # test every package
pnpm typecheck   # type-check every package
```
