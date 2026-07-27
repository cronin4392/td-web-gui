# TouchDesigner setup

Everything you build in TouchDesigner to make a `td-core` web UI talk to your
project. Budget about fifteen minutes the first time.

The whole TD side is **seven Python files and three operators**. Six of the
files are project-agnostic — you drop them in unchanged, forever. The seventh,
your config, is the only one you edit.

- [What you are building](#what-you-are-building)
- [1. Create the WebGuiServer component](#1-create-the-webguiserver-component)
- [2. Add the DATs](#2-add-the-dats)
- [3. Write your config](#3-write-your-config)
- [4. Wire up the extension](#4-wire-up-the-extension)
- [5. Verify](#5-verify)
- [Readouts](#readouts)
- [Video](#video)
- [Multiple TD instances](#multiple-td-instances)
- [Reference](#reference)

## What you are building

```
op.WebGuiServer                    ← a Base COMP with a global OP shortcut
├── Identifier      (String par)   ← names this instance to the web app
├── Port            (Int par)      ← the Web Server DAT's port
├── Config File     (File par)     ← path to your config .py
├── Td Core Dir     (Folder par)   ← this touchdesigner/ folder on this machine
│
├── config                  Text DAT   ← your config, loaded from Config File
├── WebGuiServerExt         Text DAT   ← webgui-server-ext.py    (unchanged)
├── webserver1_callbacks    Text DAT   ← webserver-callbacks.py  (unchanged)
├── webserver1              Web Server DAT
│
├── parexec_…               Parameter Execute DAT  ┐ generated, one per operator
├── parexec_…               Parameter Execute DAT  ┤ your REGISTRY references
├── chopexec_…              CHOP Execute DAT       ┤ generated, one per CHOP/DAT
├── datexec_…               DAT Execute DAT        ┘ your READOUTS references
│
├── webrtc1_callbacks       Text DAT   ← webrtc-callbacks.py     (unchanged)   ┐ video
└── webrtc1                 WebRTC DAT                                          ┘ only
```

The watcher DATs are **generated**. You never create or configure one —
`WebGuiServerExt` derives them from your config, names them after the operator
each watches, and keeps them in step as the config changes. They carry a
`webgui-generated` tag, which is the only thing the extension will ever delete.

Your UI parameters live wherever you already keep them — the bridge reaches them
by absolute path from the config, so nothing has to move.

Two ideas explain most of the design:

**Friendly names on the wire.** The browser sends `intensity`, never
`/project1/level1/opacity`. Your config's `REGISTRY` maps one to the other, so
you can rename and move operators without touching the web app.

**TouchDesigner owns type coercion.** The wire carries only `bool`, `number`,
`string`, `number[]`, and `string[][]`. TD knows a Toggle is really a 0/1 float
and a color is four separate pars; the browser never has to. See
[protocol.md § Value types](protocol.md#value-types).

## 1. Create the WebGuiServer component

Create a **Base COMP** anywhere in your project. Name it whatever you like —
`WebGuiServer` is a good default, but the name is not what matters.

**Set its global OP shortcut.** On the Common page, set `Global OP Shortcut` to
`WebGuiServer`. All three scripts find the component through `op.WebGuiServer`,
which is what lets them be dropped in unchanged no matter where you put it.

> This is the single most common setup mistake. Without the shortcut, every
> script raises `no global OP shortcut 'WebGuiServer'` on its first call.

Add four custom parameters to the component:

| Parameter   | Name         | Type   | Purpose                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identifier  | `Identifier` | String | Name reported to the web app in `welcome`. Advisory only — the web app's own config `id` wins.                                                                                                                                                                                                                     |
| Port        | `Port`       | Int    | The Web Server DAT's port. `9980` is the convention.                                                                                                                                                                                                                                                               |
| Config File | `Configfile` | File   | Path to your project's config `.py`.                                                                                                                                                                                                                                                                               |
| Td Core Dir | `Tdcoredir`  | Folder | Absolute path to this package's `touchdesigner/` folder on this machine. The callbacks DATs sync against files in it, and the generated Parameter Execute DATs resolve `parameter-execute.py` inside it. Set once per checkout, so no file parameter depends on how deep your `.toe` sits relative to the package. |

## 2. Add the DATs

Inside the component.

**Every DAT that loads a file from this package resolves it through
`Tdcoredir`**, as an expression rather than a typed-in path:

```python
op.WebGuiServer.par.Tdcoredir.eval() + '/webserver-callbacks.py'
```

Set `File` that way on each DAT below and turn on **Sync to File**. One folder
par then locates every script, so moving the checkout — or opening the project
on another machine — is a one-field fix instead of one per DAT. The generated
Parameter Execute DATs get the same expression automatically.

**`config`** — a **Text DAT** named exactly `config`. This one is the exception:
set `File` to `op.WebGuiServer.par.Configfile` (your config lives in your
project, not in this package) and turn on **Sync to File**. The scripts read your
registry back out of this DAT's compiled module, so the name `config` is
load-bearing.

**`WebGuiServerExt`** — a **Text DAT** named exactly `WebGuiServerExt`, loading
[`touchdesigner/webgui-server-ext.py`](../touchdesigner/webgui-server-ext.py).
The name matches the extension class it defines, which is the convention TD
expects. Step 4 wires it up as the component's extension.

**`webserver1_callbacks`** — a **Text DAT** loading
[`touchdesigner/webserver-callbacks.py`](../touchdesigner/webserver-callbacks.py).
Any name works as long as it matches `CALLBACKS` in your config; TD operator
names can't contain hyphens, so it won't literally be `webserver-callbacks`.

**`webserver1`** — a **Web Server DAT**:

| Parameter       | Value                      |
| --------------- | -------------------------- |
| `Active`        | On                         |
| `Port`          | `op.WebGuiServer.par.Port` |
| `Local Address` | **`127.0.0.1`**            |
| `Callbacks DAT` | `webserver1_callbacks`     |

**Set `Local Address` deliberately.** Left blank, the Web Server DAT listens on
**all** network interfaces — which means anything that can reach your machine
can drive your project's parameters. There is no authentication in this
protocol; the loopback bind is what makes that safe. See
[design-notes.md § Security model](design-notes.md#security-model).

## 3. Write your config

Copy [`touchdesigner/config-template.py`](../touchdesigner/config-template.py)
somewhere in your project and point the component's `Config File` parameter at
it. This is the only file you write.

```python
CALLBACKS = 'webserver1_callbacks'

REGISTRY = {
    'intensity': {'op': '/project1/params', 'par': 'Intensity', 'type': 'number'},
    'message':   {'op': '/project1/params', 'par': 'Message',   'type': 'string'},
    'enabled':   {'op': '/project1/params', 'par': 'Enabled',   'type': 'bool'},
    'reset':     {'op': '/project1/params', 'par': 'Reset',     'type': 'pulse'},
    'color':     {'op': '/project1/params', 'par': 'Color',     'type': 'number[]'},
}

READOUTS = {}   # optional — see § Readouts

WEBRTC = None
STREAMS = {}
```

Four things to get right:

**Paths are absolute.** These lookups run from _inside_ `WebGuiServer`, so a
bare name resolves against the component rather than your project. Always start
with `/`.

**Custom parameters are Capitalized, built-ins are lowercase.** `Intensity` is
a custom par; `device` and `mode` are TD built-ins. Getting the case wrong is a
silent no-op on the broadcast path.

**`number[]` names the ParGroup, not a component.** Write `Color`, not `Colorr`.
The ParGroup's component order _is_ the array order on the wire.

**`pulse` is not a value.** Pulse entries are excluded from snapshots and are
fired by the separate `pulse` message. Don't register a pulse par as `bool`.

The registry's names must match the keys of your TypeScript schema on the web
side. Nothing checks that for you — see
[protocol.md § Keeping the two sides in sync](protocol.md#keeping-the-two-sides-in-sync).

## 4. Wire up the extension

The extension is what pushes TD-side edits back to the browser. Without it,
nothing watches your operators: the web can write to TD but never sees a change
made in TD — a bridge that looks half broken.

On the component's **Extensions** page:

| Field                            | Value                                                 |
| -------------------------------- | ----------------------------------------------------- |
| `Extension` (the sequence count) | **`1`**                                               |
| `Extension 1 Object`             | `me.op('WebGuiServerExt').module.WebGuiServerExt(me)` |
| `Extension 1 Name`               | `WebGuiServerExt`                                     |
| `Promote Extension 1`            | On                                                    |

Then pulse `Re-Init Extensions`.

Three of those are easy to get wrong, and all three fail _silently_ — no error,
just an extension that never loads:

- **The sequence count starts at `0`.** The `Extension 1` fields exist and accept
  values while zero blocks are active, so a fully filled-in page does nothing
  until you set the count to `1`.
- **`me.op(...)`, not `op(...)`.** The Object field is evaluated with the
  component's _parent_ as context, so a bare `op('WebGuiServerExt')` looks
  outside the component and resolves to `None`.
- **The Name field is required.** Left blank, the extension is built but never
  registered, so nothing is promoted.

That's the whole step. On init the extension reads your config and generates a
watcher per operator it references:

| From       | Watcher               | Derived                                             |
| ---------- | --------------------- | --------------------------------------------------- |
| `REGISTRY` | Parameter Execute DAT | `OPs`, `Parameters`, `Custom`, `Built-In`           |
| `READOUTS` | CHOP Execute DAT      | `CHOP`, `Channel`, `Value Change`                   |
| `READOUTS` | DAT Execute DAT       | `DAT`, `Table Change`, `Execute` = **End of Frame** |

Two of those are easy to get wrong by hand and fail silently when you do:
expanding a `number[]` entry to its ParGroup components, and setting the DAT
Execute DAT's `Execute` to End of Frame (at Start of Frame it fires once per
change within a frame instead of once total).

To pick up a config change without restarting, pulse a rebuild from the
textport:

```python
op.WebGuiServer.Rebuild()
```

`Rebuild()` is idempotent and diff-based — it compares the config against the
DATs that are live at that moment and applies only the difference, so calling it
when nothing has changed writes nothing. It deliberately caches no "already
built" state, because storage survives a TDN import that deletes children, and a
remembered flag would outlive the DATs it described.

Edits that arrive _from_ the web flow through these DATs too — the callbacks set
`par.val`, which fires them — so there is one broadcast path for both directions
rather than two that can disagree.

> **Why one DAT per operator.** A Parameter Execute DAT's `OPs` and `Parameters`
> fields form a cross product, so a single DAT covering every operator watches
> every registered parameter _name_ on every one of them. Custom names rarely
> collide across operators; built-in ones (`file`, `index`, `device`) collide
> constantly, and `Built-In` is a per-DAT toggle. Splitting per operator keeps
> each watch to exact pairs and scopes `Built-In` to the operators that need it.
> A CHOP Execute DAT's `CHOP`/`Channel` fields are a cross product in exactly the
> same way, and channel names (`tx`, `level`, `chan1`) collide across CHOPs far
> more readily than parameter names do.

## 5. Verify

Start your web app and watch TD's textport. A healthy connect logs nothing at
all; every failure mode below prints a specific warning.

| Symptom                                                                     | Cause                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no global OP shortcut 'WebGuiServer'`                                      | Step 1 — the shortcut isn't set.                                                                                                                                    |
| `WebGuiServer has no 'config' DAT`                                          | The Text DAT isn't named exactly `config`, or `Config File` is empty.                                                                                               |
| `operator '...' not found - REGISTRY paths should be absolute`              | A registry path is missing its leading `/`.                                                                                                                         |
| `operator '...' has no par '...'`                                           | Wrong case (`intensity` vs `Intensity`), or the par doesn't exist.                                                                                                  |
| `has no ParGroup '...'`                                                     | A `number[]` entry names a component (`Colorr`) instead of the group (`Color`).                                                                                     |
| Web can write, but TD-side changes never appear                             | Step 4 — the extension isn't wired, so no `parexec_…` DATs were generated. Check the component for them.                                                            |
| No `parexec_…` DATs at all                                                  | The extension isn't wired, or `config` can't be read. `Rebuild()` leaves the network alone when the registry is unreadable rather than deleting every watcher.      |
| `Tdcoredir is empty - generated DATs have no callback code`                 | Step 1 — the `Td Core Dir` par isn't set.                                                                                                                           |
| Extension page filled in, but `op.WebGuiServer.Rebuild()` says no attribute | Step 4 — the `Extension` sequence count is still `0`, the Object field uses `op(...)` instead of `me.op(...)`, or the Name field is blank. All three fail silently. |
| One operator's changes never appear, others do                              | Its `parexec_…` DAT is missing or its registry entry names an operator that doesn't exist. Run `op.WebGuiServer.Rebuild()` and re-read the textport warnings.       |
| `readout '...': '...' is a DAT, but this entry reads a CHOP`                | A `chan` entry pointing at a DAT, or a `row`/`col` entry pointing at a CHOP.                                                                                        |
| `readout '...': '...' has no channel '...'`                                 | The CHOP exists but that channel doesn't. Channel names are case-sensitive.                                                                                         |
| `readout '...' names only an operator`                                      | A whole-table entry missing its `'type': 'string[][]'`.                                                                                                             |
| `'...' is in both REGISTRY and READOUTS`                                    | A name collision. The `REGISTRY` entry wins and the readout is ignored — rename one of them.                                                                        |

More in [troubleshooting.md](troubleshooting.md).

## Readouts

Optional, and orthogonal to everything above. `READOUTS` publishes values that
have **no parameter behind them** — a CHOP channel, a DAT cell, a whole DAT
table — one-way, TD → web.

Use it when the value is _data_ rather than a setting: an analysis level, a
timecode, a now-playing table. You could export the channel onto a parameter and
register it instead, but that costs a par per value and leaves the par in
`EXPORT` mode, which the web then has to refuse writes to anyway.

```python
READOUTS = {
    'fps':     {'op': '/project1/perf_stats',  'chan': 'fps'},
    'level':   {'op': '/project1/audio_bands', 'chan': ['low', 'mid', 'high']},
    'playing': {'op': '/project1/transport',   'chan': 'playing', 'type': 'bool'},
    'track':   {'op': '/project1/nowplaying',  'row': 'title', 'col': 1},
    'cues':    {'op': '/project1/cue_table',   'type': 'string[][]'},
}
```

**The entry's shape picks the source**, and with it the wire type:

| Entry                        | Reads               | Wire type    | Component             |
| ---------------------------- | ------------------- | ------------ | --------------------- |
| `'chan': 'fps'`              | one CHOP channel    | `number`     | `<Value>`             |
| `'chan': ['low','mid','hi']` | several channels    | `number[]`   | `<Vector>`, `<Value>` |
| `'row': 'title', 'col': 1`   | one DAT cell        | `string`     | `<Value>`             |
| `'type': 'string[][]'`       | the whole DAT table | `string[][]` | `<Table>`             |

`type` is optional and defaults to the natural type above. Declare it only to
override: a 0/1 gate channel as `'bool'`, a numeric cell as `'number'`. **A
whole-table entry must declare `'type': 'string[][]'`** — an entry naming only an
operator is otherwise indistinguishable from one whose `chan` you forgot.

Four things to know:

**Readouts and parameters share one namespace on the web.** A readout is bound by
name exactly like a parameter (`<Value name="fps" />`), appears in the same
TypeScript schema, and rides the same messages. A name in **both** maps is a
config error — the `REGISTRY` entry wins and TD warns naming the collision.

**Declare them `readonly` on the web side.** TD refuses a write either way
(`param_not_writable`), but declaring it renders the control disabled from the
start rather than after the first refused edit.

```tsx
<App.Provider url={url} readonly={['fps', 'level', 'track', 'cues']}>
```

**Channel order is the array order.** Reordering a `chan` list reassigns which
number is which on the web — the same way a ParGroup's component order does. A
pattern (`'band*'`) is deliberately not accepted, since it would make the array's
length depend on what the CHOP happens to hold this frame.

**A cell may not be declared `'bool'`.** There's no guess-free string → bool cast
(`"false"` is truthy), and silently turning an off into an on is worse than
refusing the entry.

### Rate

Everything that changes within a frame is coalesced into **one `update` sent at
end of frame**, so the ceiling is one message per frame however many readouts
moved.

That's required, not tuning: a CHOP Execute DAT fires once per changed _sample_
per channel, and on a time-sliced CHOP one frame "may get called 2 or more times
per channel". One message per frame is still 60/sec for a channel that moves
every frame — if the UI doesn't need that, **resample or filter the CHOP in
TouchDesigner**. There is deliberately no rate setting in the config, because a
Resample or Filter CHOP is a better tool than a config field would be.

## Video

Video is entirely optional. A project with `WEBRTC = None` runs the parameter
bridge with no WebRTC DAT at all, and the web side opens no peer unless you pass
`video` to the `<Provider>`.

### Requirements

The Video Stream Out TOP **uses NVIDIA's hardware encoder and requires an NVIDIA
GPU on Windows.** There is no software fallback. GeForce cards also cap the
machine at **8 simultaneous encoder sessions** — which is the real ceiling on how
many streams one project can serve. Quadro / RTX Pro cards have no session limit.

### Wiring

**`webrtc1_callbacks`** — a Text DAT loading
[`touchdesigner/webrtc-callbacks.py`](../touchdesigner/webrtc-callbacks.py),
via the same `Tdcoredir` expression as the other package scripts (step 2).

**`webrtc1`** — a **WebRTC DAT**:

| Parameter                    | Value               |
| ---------------------------- | ------------------- |
| `Active`                     | On                  |
| `Callbacks DAT`              | `webrtc1_callbacks` |
| `STUN Server URL` (ICE page) | **empty**           |
| `TURN Server` (ICE page)     | **empty**           |

Leave STUN and TURN empty. Browser and TD are on the same machine, so ICE only
ever needs host candidates, and skipping the servers keeps gathering near-instant
when several peers come up at once.

> Those host candidates are _not_ `127.0.0.1` in practice — Chrome emits an mDNS
> `.local` name and TD offers its LAN interface. They pair fine. Don't chase a
> non-loopback candidate as the cause of a failure.

**One Video Stream Out TOP per stream**, each with:

| Parameter                                             | Value                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `Mode`                                                | `WebRTC`                                                              |
| `FPS`                                                 | A constant (e.g. `30`), **not** the default `me.time.rate` expression |
| `WebRTC` / `WebRTC Connection` / `WebRTC Video Track` | Left alone — the callbacks set these per peer                         |

Pin `FPS` to a constant. At the default `me.time.rate`, eight encoders each run
at your project's frame rate, which is how a 60fps project quietly spends its
whole GPU budget on encoding.

Then list the streams in your config:

```python
WEBRTC = 'webrtc1'
STREAMS = {
    'tile1': {'top': '/project1/videostreamout_tile1', 'label': 'Tile 1'},
    'tile2': {'top': '/project1/videostreamout_tile2', 'label': 'Tile 2'},
}
```

The `id` is what `<Video stream="tile1">` selects on. **Insertion order is
load-bearing** — the callbacks zip this dict against the video m-lines of the
negotiated SDP in order, so reordering entries reassigns which id names which
track.

### Flip the image in TD, not in CSS

TD's WebRTC output arrives at the browser **mirrored in X**, even though the TD
viewer shows the source the right way round. Feed each Video Stream Out TOP
through a **Flip TOP with `flipx` on**.

Derivative's own WebRTC palette component compensates with a CSS transform on the
video container instead. Don't copy that: going fullscreen in Chrome drops the
styling and the mirror comes back
([forum thread](https://forum.derivative.ca/t/stunned-by-webrtcpanel/293915)).
Flipping at the encoder fixes every consumer of the stream, in every browser
state.

### The web side must offer enough m-lines

An answerer cannot add m-lines to an SDP. Whatever the browser offers is the
ceiling on how many tracks TD can attach, so a wall of eight needs all eight
offered up front:

```tsx
<App.Provider url={url} video={{ receivers: 8 }}>
```

`receivers` must be **≥** the number of entries in `STREAMS`. Get it wrong and
the surplus streams have nowhere to land; `webrtc-callbacks.py` prints a warning
naming both counts.

### One viewer at a time

A Video Stream Out TOP's `WebRTC Connection` parameter holds a **single** value,
so one TOP serves one peer. A second browser connecting re-points every TOP and
takes the stream — the first browser's tiles freeze on their last frame while its
peer stays happily `connected`, with no error to show for it.

The callbacks make this visible rather than mysterious: the newcomer gets a
non-fatal `video_single_viewer` error and TD logs a warning. Serving two browsers
simultaneously needs a second full set of Video Stream Out TOPs.

## Multiple TD instances

Each TD process hosts its own Web Server DAT on its own port, and the web app
opens one independent connection per instance. Repeat this whole setup in each
project, giving each a distinct `Port` and `Identifier`, then declare them on the
web side:

```ts
export const instances = [
  { id: 'mixer', url: 'ws://localhost:9980' },
  { id: 'render', url: 'ws://localhost:9981' },
];
```

Schemas are per-instance, so each gets its own `createTDClient<Schema>()`. See
[api.md § Multiple instances](api.md#multiple-instances).

## Reference

| File                                                                | Edit?   | Role                                                             |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| [`webserver-callbacks.py`](../touchdesigner/webserver-callbacks.py) | Never   | Web Server DAT callbacks: parameters, readouts, menus, signaling |
| [`webgui-server-ext.py`](../touchdesigner/webgui-server-ext.py)     | Never   | The extension that generates every watcher DAT below             |
| [`parameter-execute.py`](../touchdesigner/parameter-execute.py)     | Never   | Parameter Execute DAT: TD → web parameter broadcast              |
| [`chop-execute.py`](../touchdesigner/chop-execute.py)               | Never   | CHOP Execute DAT: TD → web readout broadcast                     |
| [`dat-execute.py`](../touchdesigner/dat-execute.py)                 | Never   | DAT Execute DAT: TD → web readout broadcast                      |
| [`webrtc-callbacks.py`](../touchdesigner/webrtc-callbacks.py)       | Never   | WebRTC DAT callbacks: outbound signaling, `streams` announce     |
| [`config-template.py`](../touchdesigner/config-template.py)         | **Yes** | Your registry, readouts, wiring names, and stream map            |

`REGISTRY` entry fields:

| Field      | Required            | Meaning                                                                                                                |
| ---------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `op`       | Yes                 | Absolute path to the operator                                                                                          |
| `par`      | Yes                 | Parameter name, or ParGroup base name for `number[]`                                                                   |
| `type`     | Yes                 | `'bool'` · `'number'` · `'string'` · `'number[]'` · `'pulse'`                                                          |
| `writable` | No (default `True`) | `False` refuses web writes with `param_not_writable`. Not sent to the web — the browser authors its own read-only set. |

A parameter in `EXPRESSION`, `EXPORT`, or `BIND` mode is refused whether or not
it's flagged, so `writable: False` is only needed for a `CONSTANT` par you want
to keep TD-driven. See
[design-notes.md § Parameter modes](design-notes.md#parameter-modes) for why that
guard protects your project and not just the user's edit.

`READOUTS` entry fields — one-way TD → web, so there is no `writable`:

| Field       | Required                               | Meaning                                                                              |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `op`        | Yes                                    | Absolute path to the CHOP or DAT                                                     |
| `chan`      | For a CHOP                             | One channel name (`number`), or a list of them (`number[]`); order is the wire order |
| `row`/`col` | For a DAT cell                         | Row and column, each a name or an index. Both required together.                     |
| `type`      | Only to override, or for a whole table | `'number'` · `'bool'` · `'string'` · `'number[]'` · `'string[][]'`                   |

See [§ Readouts](#readouts) above for the shape-to-type table and the rate note.
