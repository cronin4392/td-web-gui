# td-core example

A working Solid app exercising every `td-core` control against **two**
TouchDesigner projects at once — one column per instance, each with its own
connection, its own WebRTC peer, and its own parameter schema.

## Run it

```sh
pnpm install
pnpm --filter td-core build     # the example imports td-core from its built dist/
pnpm --filter example dev
```

Then open both `td/Example1/Example.toe` and `td/Example2/Example2.toe` in
TouchDesigner. On first open, set each project's `WebGuiServer` **TD Core Dir**
parameter to the absolute path of `packages/td-core/touchdesigner` on your
machine — the callback DATs sync against files there, and that path isn't derived
from where the `.toe` lives.

The app connects to `ws://localhost:9980` (instance 1) and `ws://localhost:9981`
(instance 2) by default; override with `VITE_TD_HOST` / `VITE_TD_PORT_1` /
`VITE_TD_PORT_2`. Opening only one `.toe` is fine — the other column just sits at
"reconnecting…", which is itself the demonstration that the two connections are
independent.

Parameters work with the `.toe` files alone. The video walls additionally need an
NVIDIA GPU on Windows — see
[touchdesigner-setup.md § Video](../../packages/td-core/docs/touchdesigner-setup.md#video).

## What's here

| File                                   |                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`src/td.config.ts`](src/td.config.ts) | Both instance descriptors and both typed parameter schemas. This is the file that must agree with TouchDesigner's `REGISTRY`. |
| [`src/App.tsx`](src/App.tsx)           | The two panels, the shared status/video components, and every control.                                                        |
| [`src/index.css`](src/index.css)       | Plain CSS against `td-core`'s class hooks — the library ships none.                                                           |

Worth reading in `App.tsx`:

- **The two factories** — `createTDClient<Example1Params>()` and
  `createTDClient<Example2Params>()`. They are purely compile-time: the
  components they hand back are the same components, bound to whichever
  `<Provider>` they render inside. Typing instance 1's `message` into instance
  2's column is a type error, not a silently dropped `update`.
- **`StatusBar` / `VideoWall`** — built from the bare `useTDConnection` /
  `useTDVideoStream` rather than from either factory, because neither names a
  parameter. One component serves both columns.
- **The per-tile `<StreamToggle>`** — unchecking one stops that stream's encoder
  and everything feeding it in TouchDesigner, which the wall's heading counts
  ("_N_ encoding"). The peer is untouched, so the tile comes back on TD's next
  frame; watch `videostreamout_tile2` and its `select_`/`fit_`/`flip_` chain stop
  cooking while it's off.
- **`AudioDevicePicker`** — a `<Select>` with **no** `options` prop, whose
  choices TouchDesigner announces because they can't be authored in advance,
  plus the reload button that refreshes them. Instance 1 only.
- **Instance 2's `opacity`** — read-only from the web because TD's registry flags
  it `writable: False`. That flag never crosses the wire, so the disabled state
  comes from this app's own read-only set; the comment on `example2Readonly` in
  `td.config.ts` says how to watch the runtime backstop fire.

## The two schemas

Instance 1 is the kitchen sink: one param per control kind, every readout shape,
both menu cases, four video tiles. Instance 2 is a smaller, differently-named
playback node: no menu, no table readout, one `writable: False` entry, four more
video tiles.

The names differ even where the same TD parameter backs them — instance 2's
`label` is `/project1/params/Message`, exactly like instance 1's `message` —
because a wire name belongs to its instance, not to TouchDesigner. Each project's
`config.py` docstring covers its own side.

The eight streams of the earlier single-instance wall are now split four and
four, so the total encoder load is unchanged. Each wall takes a different half of
one tint palette, which makes a tile rendered under the wrong instance as obvious
as a mis-mapped `mid` is within one.
