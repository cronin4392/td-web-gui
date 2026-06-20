# td-core

Reusable [Solid.js](https://www.solidjs.com/) library for building web UIs that talk to [TouchDesigner](https://derivative.ca/) — bidirectional control data (text, numbers, messages) over WebSocket and real-time video over WebRTC, with signaling multiplexed over the same WebSocket.

Droppable into any Solid project. Ships **zero CSS** (headless) and treats `solid-js` as a peer dependency so the consuming app provides the single Solid runtime.

> **Status: early development.** Phase 1 is scaffolding — the package currently exports only a trivial placeholder (see below). The full API (`createTDClient`, connection/signal helpers, control & video components) is described in [the tech proposal](../../prds/TECH_PROPOSAL.md) and lands over subsequent phases ([task plan](../../prds/TASKS.md)).

## Install

In this monorepo it's consumed via the workspace protocol:

```jsonc
// package.json
"dependencies": {
  "td-core": "workspace:*",
  "solid-js": "^1.9.0"   // peer dependency — provided by the app
}
```

The consuming app must compile with a Solid-aware toolchain (e.g. `vite-plugin-solid`): the library ships **JSX-preserving** output under the `solid` export condition, so the app's compiler turns the JSX into Solid's reactive DOM calls. This is what keeps a single reactive graph — bundling `solid-js` into the library would create a second graph and silently break reactivity.

## Usage

Today (scaffold):

```tsx
import { Hello, version } from 'td-core'

console.log(version) // "0.0.0"

function App() {
  return <Hello name="world" />
}
```

Planned primary API (per the [tech proposal](../../prds/TECH_PROPOSAL.md) — not yet implemented):

```tsx
// One schema-bound factory per TD instance
const Mixer = createTDClient<MixerParams>()

<Mixer.Provider url="ws://localhost:9980">
  <Mixer.TextInput name="text1" />
  <Mixer.Range name="speed" min={0} max={10} />
  <Mixer.Video />
</Mixer.Provider>
```

## Develop

Run from this package directory, or from the repo root with `pnpm --filter td-core <script>`.

```sh
pnpm build        # emit JSX-preserving build + type declarations to dist/
pnpm test         # run the Vitest suite once
pnpm test:watch   # Vitest in watch mode
pnpm typecheck    # type-check without emitting
```

## Build output

`pnpm build` runs `tsc` with `jsx: "preserve"`, producing:

- `dist/index.jsx` — JSX-preserving ES module (consumer's Solid compiler handles the JSX)
- `dist/index.d.ts` (+ `.d.ts.map`) — TypeScript declarations

The `exports` map exposes this under the `solid` and `default` conditions with `types`.
