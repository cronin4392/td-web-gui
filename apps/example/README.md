# td-core example

A working Solid app exercising every `td-core` control against the reference
TouchDesigner project, plus an eight-tile WebRTC video wall.

## Run it

```sh
pnpm install
pnpm --filter td-core build     # the example imports td-core from its built dist/
pnpm --filter example dev
```

Then open `td/Example.toe` in TouchDesigner. The app connects to
`ws://localhost:9980` by default; override with `VITE_TD_HOST` / `VITE_TD_PORT`.

Parameters work with the `.toe` alone. The video wall additionally needs an
NVIDIA GPU on Windows — see
[touchdesigner-setup.md § Video](../../packages/td-core/docs/touchdesigner-setup.md#video).

## What's here

| File | |
|---|---|
| [`src/td.config.ts`](src/td.config.ts) | The instance list and the typed parameter schema. This is the file that must agree with TouchDesigner's `REGISTRY`. |
| [`src/App.tsx`](src/App.tsx) | Every control, a live connection-status readout, and the video wall. |
| [`src/index.css`](src/index.css) | Plain CSS against `td-core`'s class hooks — the library ships none. |

Worth reading in `App.tsx`:

- **`StatusBar`** — reading `status()`, `congested()`, and `lastError()` off the
  connection so a reconnect shows as "reconnecting…" instead of a frozen UI.
- **`AudioDevicePicker`** — a `<Select>` with **no** `options` prop, whose
  choices TouchDesigner announces because they can't be authored in advance,
  plus the reload button that refreshes them.
- **`VideoWall`** — a grid driven by `video.streams()` rather than a fixed count,
  with per-tile `streamStatus(id)` overlays.

The TouchDesigner side of this app is `td/config-example.py`; its docstring lists
every operator and parameter the project expects.
