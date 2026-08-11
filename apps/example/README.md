# td-core example

Two pages against real TouchDesigner projects:

| Page            |                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/minimal.html` | **Start here.** One instance, five controls, one video tile — one file, [`src/Minimal.tsx`](src/Minimal.tsx), that you can copy into your own app.                                               |
| `/` (index)     | The full tour: every `td-core` control against **two** TouchDesigner projects at once, one column per instance, each with its own connection, its own WebRTC peer, and its own parameter schema. |

Nothing in the full tour changes what the minimal page does — it only adds more
of it. Read them in that order.

## Run it

```sh
pnpm install
pnpm --filter td-core build     # the example imports td-core from its built dist/
pnpm --filter example dev
```

Vite prints the URL (`http://localhost:5173` unless the port is taken). The
minimal page is at `/minimal.html`.

Then open both `td/Example1/Example.toe` and `td/Example2/Example2.toe` in
TouchDesigner. There is nothing to configure: each project's `WebGuiServer`
**TD Core Dir** parameter is an expression off `project.folder`, so a fresh clone
finds `packages/td-core/touchdesigner` wherever you put the repo. (In your own
project that parameter is a plain path you set once — see
[touchdesigner-setup.md](../../packages/td-core/docs/touchdesigner-setup.md). It
is an expression here only because these two `.toe` files live at a fixed depth
inside this repo.)

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
| [`src/Minimal.tsx`](src/Minimal.tsx)   | The whole minimal page, mount included. The one file to copy.                                                                 |
| [`src/td.config.ts`](src/td.config.ts) | Both instance descriptors and both typed parameter schemas. This is the file that must agree with TouchDesigner's `REGISTRY`. |
| [`src/App.tsx`](src/App.tsx)           | The two panels, the shared status/video components, and every control.                                                        |
| [`src/index.css`](src/index.css)       | Plain CSS against `td-core`'s class hooks — the library ships none.                                                           |

The TouchDesigner side is two projects under [`td/`](td). Open either `.toe` and
the top-level network is annotated by group — the bridge, the parameters the web
drives, the readouts it displays, and the video it receives — with the config
that maps them beside it in `config.py`.

Worth reading in `App.tsx`:

- **The two factories** — `createTDClient<Example1Params>()` and
  `createTDClient<Example2Params>()`. The components they hand back are the same
  components behind different `name` types, and each binds the nearest
  `<Provider>` **of its own factory**. Typing instance 1's `message` into
  instance 2's column is a type error, not a silently dropped `update`.
- **The nested providers, in `App`** — instance 2's `<Provider>` renders inside
  instance 1's rather than beside it. Scoping is per factory, so the nesting
  changes nothing about what either column reads; what it buys is the bullet
  below. Siblings are the shape most apps have.
- **`CrossInstanceReadout`** — an `Example1.Value` and an `Example2.Value` in one
  paragraph, rendered inside instance 2's column. They read two different
  TouchDesigner processes from the same spot in the tree, because a bundle member
  resolves its own factory's provider and skips anything else on the way up. Drag
  instance 1's intensity slider in column 1 and watch it move here.
- **`StatusBar` / `VideoWall`** — built from the bare `useTDConnection` /
  `useTDVideoStream` rather than from either factory, because neither names a
  parameter. Those bare exports take the nearest provider of _any_ factory, which
  is exactly what lets one component serve both columns.
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
