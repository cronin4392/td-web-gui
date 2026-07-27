# td-core

Build web UIs that control [TouchDesigner](https://derivative.ca/), in
[Solid.js](https://www.solidjs.com/).

Bidirectional parameters over WebSocket, real-time video over WebRTC, and a typed
component for every kind of TouchDesigner parameter. Drop it into any Solid
project — it ships **zero CSS** and treats `solid-js` as a peer dependency.

```tsx
const Mixer = createTDClient<MixerParams>()

<Mixer.Provider url="ws://localhost:9980" video>
  <Mixer.TextInput  name="message" />
  <Mixer.RangeInput name="intensity" min={0} max={1} step={0.01} />
  <Mixer.Color      name="tint" alpha />
  <Mixer.Button     name="reset" mode="pulse">Reset</Mixer.Button>
  <Mixer.Video />
</Mixer.Provider>
```

Parameter names autocomplete from your schema, and a typo is a compile error —
inside JSX, where you actually write it.

## Contents

- [Why](#why) · [Install](#install) · [Quick start](#quick-start)
- [What's in the box](#whats-in-the-box)
- [Documentation](#documentation) · [Requirements](#requirements) ·
  [Development](#development)

## Why

Every TouchDesigner project of any size ends up needing a control surface.
Building one out of Container COMPs and panel widgets is the native answer. This
is a different one: **build the UI as a web page.**

You get CSS for layout, the browser's input widgets, your own editor and version
control, and a UI that's a separate artifact from the network it drives —
friendly parameter names on the wire mean operators can be renamed or moved
without touching the UI.

What you get over hand-rolling a WebSocket:

- **Typed parameters.** One schema, checked in JSX.
- **A component per parameter kind** — including the awkward ones: ParGroups,
  pulse parameters, momentary buttons, TD-populated menus.
- **Correctness under real conditions.** Optimistic writes that don't fight the
  user's cursor, reconnect with resync, rAF throttling, backpressure, and a
  guard that stops a web write from silently detaching a TD author's expression.
- **Video that actually renders.** WebRTC signaling multiplexed over the same
  socket, and the handful of TD-specific traps already worked around.

## Install

```sh
npm install td-core solid-js
```

`solid-js` is a **peer dependency** — your app provides the single Solid runtime.
Bundling a second copy would create a second reactive graph and silently break
reactivity.

Your app must compile with a Solid-aware toolchain (`vite-plugin-solid` or
equivalent). The library ships **JSX-preserving** output under the `solid` export
condition, so your compiler turns its JSX into Solid's reactive DOM calls in the
same pass as your own components.

## Quick start

### 1. Set up TouchDesigner

The package ships the TouchDesigner half of the bridge in
[`touchdesigner/`](touchdesigner/) — four project-agnostic Python files you drop
in unchanged, plus a config template you edit.

**→ [Full walkthrough: docs/touchdesigner-setup.md](docs/touchdesigner-setup.md)**

In short: a Base COMP with the global OP shortcut `WebGuiServer`, holding a Web
Server DAT, the callbacks, and an extension that generates the Parameter Execute
DATs watching your operators; and a config mapping friendly names to parameters.

```python
# your-config.py
CALLBACKS = 'webserver1_callbacks'

REGISTRY = {
    'message':   {'op': '/project1/params', 'par': 'Message',   'type': 'string'},
    'intensity': {'op': '/project1/params', 'par': 'Intensity', 'type': 'number'},
    'tint':      {'op': '/project1/params', 'par': 'Tint',      'type': 'number[]'},
    'reset':     {'op': '/project1/params', 'par': 'Reset',     'type': 'pulse'},
}
```

### 2. Declare the same parameters in TypeScript

```ts
// src/td.config.ts
export interface MixerParams {
  message: string;
  intensity: number;
  tint: number[];
  reset: boolean;
}
```

Both sides are hand-authored and nothing checks that they agree — that's a
deliberate trade, explained in
[protocol.md § Keeping the two sides in sync](docs/protocol.md#keeping-the-two-sides-in-sync).

### 3. Build the UI

```tsx
import { createTDClient } from 'td-core';
import type { MixerParams } from './td.config';

const Mixer = createTDClient<MixerParams>();

export function App() {
  return (
    <Mixer.Provider url="ws://localhost:9980" instance="mixer">
      <label>
        Message
        <Mixer.TextInput name="message" placeholder="Type a message…" />
      </label>

      <Mixer.RangeInput name="intensity" min={0} max={1} step={0.01} />
      <Mixer.Value name="intensity" format={(v) => Number(v).toFixed(2)} />

      <Mixer.Vector name="tint" labels={['r', 'g', 'b']} step={0.01} />
      <Mixer.Button name="reset" mode="pulse">
        Reset
      </Mixer.Button>
    </Mixer.Provider>
  );
}
```

Both controls above bind `intensity` — they share one signal, so dragging the
slider updates the readout instantly, and a change made in TouchDesigner updates
both.

### 4. Add video

```tsx
<Mixer.Provider url="ws://localhost:9980" video={{ receivers: 8 }}>
  <Mixer.Video stream="tile1" />
</Mixer.Provider>
```

Video is opt-in per provider — without it, no `RTCPeerConnection` is created at
all. `receivers` is how many tracks TD can attach, so it must be at least your
`STREAMS` count. See
[touchdesigner-setup.md § Video](docs/touchdesigner-setup.md#video).

## What's in the box

**Components** — every one binds a parameter by `name`, passes through HTML
props, and carries a stable `td-*` class hook.

|                                |                                                                      |
| ------------------------------ | -------------------------------------------------------------------- |
| `<TextInput>`                  | String parameters. `commitOn="input" \| "enter"`, `multiline`.       |
| `<NumberInput>` `<RangeInput>` | Numbers, with `min`/`max`/`step`. Sliders throttle by default.       |
| `<Toggle>`                     | Bool parameters.                                                     |
| `<Button>`                     | `mode="pulse" \| "hold" \| "toggle"` — momentary, held, or latching. |
| `<Select>`                     | Menu parameters. Options authored by you, or announced by TD.        |
| `<Vector>` `<Color>`           | Multi-component ParGroups — XYZ, RGB, RGBA.                          |
| `<Value>`                      | Read-only readout, with an optional `format`.                        |
| `<Video>`                      | One WebRTC stream, selected by announced id.                         |

**Connection** — `createTDClient<Schema>()` for typed UI;
`createTDConnection(url)` standalone, with no context or component tree.
Reconnect with backoff, handshake watchdog, heartbeat, rAF throttle,
backpressure, and read-only parameter handling — all per-connection options with
sane defaults.

**Video** — `createTDVideoStream()`. One peer per instance carrying every one of
its tracks, signaling multiplexed over the control socket, per-stream status, and
rebuild-on-failure.

**TouchDesigner** — [`touchdesigner/`](touchdesigner/): the DAT callbacks
implementing the other half of the protocol, and a commented config template.

## Documentation

|                                                        |                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **[TouchDesigner setup](docs/touchdesigner-setup.md)** | Start here. Building the TD side, step by step.                                                   |
| [Components](docs/components.md)                       | Every component, every prop, and the styling hooks.                                               |
| [API reference](docs/api.md)                           | Factory, provider, connection, video, primitives.                                                 |
| [Wire protocol](docs/protocol.md)                      | The message catalog, for debugging or reimplementing the TD side.                                 |
| [Design notes](docs/design-notes.md)                   | Why it works this way — including TouchDesigner behavior that contradicts the obvious assumption. |
| [Troubleshooting](docs/troubleshooting.md)             | Symptoms and causes.                                                                              |

New to the project? [TouchDesigner setup](docs/touchdesigner-setup.md), then
[Components](docs/components.md). Debugging something strange?
[Troubleshooting](docs/troubleshooting.md), then
[Design notes § Non-obvious TouchDesigner behavior](docs/design-notes.md#non-obvious-touchdesigner-behavior).

## Requirements

|               |                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TouchDesigner | Developed and tested against **2025.33070**. Needs a Web Server DAT and the generated Parameter Execute DATs; video additionally needs a WebRTC DAT. Older builds are untested. |
| Solid.js      | ^1.9.0                                                                                                                                                                          |
| Browsers      | Desktop Chrome and Firefox                                                                                                                                                      |
| Video         | NVIDIA GPU on Windows — the Video Stream Out TOP requires NVIDIA's hardware encoder. GeForce cards cap the machine at 8 encoder sessions.                                       |

Parameters work on any platform TouchDesigner runs on; only video carries the
NVIDIA/Windows requirement.

**This is built for a closed, single-machine system** — the browser, the web
app, and every TouchDesigner instance run on the same box. There is no
authentication, and the Web Server DAT is meant to be bound to `127.0.0.1`. See
[design-notes.md § Security model](docs/design-notes.md#security-model) before
exposing any of it to a network.

## Development

```sh
pnpm build        # emit JSX-preserving build + type declarations to dist/
pnpm test         # run the Vitest suite once
pnpm test:watch   # Vitest in watch mode
pnpm typecheck    # type-check without emitting
```

Tests run against an in-memory TouchDesigner — a stub WebSocket server and a
faked `RTCPeerConnection` — so the full wire contract is covered without a live
`.toe`. The same injection seams are public; see
[api.md § Testing](docs/api.md#testing).

`pnpm build` runs `tsc` with `jsx: "preserve"`, producing `dist/*.jsx` plus
`.d.ts` declarations. Vite's lib mode is deliberately not used: `vite-plugin-solid`
always pre-compiles JSX to DOM calls, which would defeat the single-reactive-graph
guarantee.

## License

[MIT](LICENSE) © Stephen Cronin
