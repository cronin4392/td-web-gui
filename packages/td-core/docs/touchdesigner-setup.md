# TouchDesigner setup

Everything you build in TouchDesigner to make a `td-core` web UI talk to your
project. Budget about fifteen minutes the first time.

The whole TD side is **four Python files and three operators**. Three of the
files are project-agnostic — you drop them in unchanged, forever. The fourth,
your config, is the only one you edit.

- [What you are building](#what-you-are-building)
- [1. Create the WebGuiServer component](#1-create-the-webguiserver-component)
- [2. Add the DATs](#2-add-the-dats)
- [3. Write your config](#3-write-your-config)
- [4. Add the Parameter Execute DAT](#4-add-the-parameter-execute-dat)
- [5. Verify](#5-verify)
- [Video](#video)
- [Multiple TD instances](#multiple-td-instances)
- [Reference](#reference)

## What you are building

```
op.WebGuiServer                    ← a Base COMP with a global OP shortcut
├── Identifier      (String par)   ← names this instance to the web app
├── Port            (Int par)      ← the Web Server DAT's port
├── Config File     (File par)     ← path to your config .py
│
├── config                  Text DAT   ← your config, loaded from Config File
├── webserver1_callbacks    Text DAT   ← webserver-callbacks.py  (unchanged)
├── webserver1              Web Server DAT
│
├── webrtc1_callbacks       Text DAT   ← webrtc-callbacks.py     (unchanged)   ┐ video
└── webrtc1                 WebRTC DAT                                          ┘ only

anywhere in your project:
    parexec1                Parameter Execute DAT  ← parameter-execute.py (unchanged)
```

Your UI parameters live wherever you already keep them — the bridge reaches them
by absolute path from the registry, so nothing has to move.

Two ideas explain most of the design:

**Friendly names on the wire.** The browser sends `intensity`, never
`/project1/level1/opacity`. Your config's `REGISTRY` maps one to the other, so
you can rename and move operators without touching the web app.

**TouchDesigner owns type coercion.** The wire carries only `bool`, `number`,
`string`, and `number[]`. TD knows a Toggle is really a 0/1 float and a color is
four separate pars; the browser never has to. See
[protocol.md § Value types](protocol.md#value-types).

## 1. Create the WebGuiServer component

Create a **Base COMP** anywhere in your project. Name it whatever you like —
`WebGuiServer` is a good default, but the name is not what matters.

**Set its global OP shortcut.** On the Common page, set `Global OP Shortcut` to
`WebGuiServer`. All three scripts find the component through `op.WebGuiServer`,
which is what lets them be dropped in unchanged no matter where you put it.

> This is the single most common setup mistake. Without the shortcut, every
> script raises `no global OP shortcut 'WebGuiServer'` on its first call.

Add three custom parameters to the component:

| Parameter | Name | Type | Purpose |
|---|---|---|---|
| Identifier | `Identifier` | String | Name reported to the web app in `welcome`. Advisory only — the web app's own config `id` wins. |
| Port | `Port` | Int | The Web Server DAT's port. `9980` is the convention. |
| Config File | `Configfile` | File | Path to your project's config `.py`. |

## 2. Add the DATs

Inside the component:

**`config`** — a **Text DAT** named exactly `config`. On its File page set
`File` to `op.WebGuiServer.par.Configfile` and turn on **Sync to File**. The
scripts read your registry back out of this DAT's compiled module, so the name
`config` is load-bearing.

**`webserver1_callbacks`** — a **Text DAT** holding
[`touchdesigner/webserver-callbacks.py`](../touchdesigner/webserver-callbacks.py).
Point its `File` parameter at the file and turn on **Sync to File** so edits
land without a copy-paste. Any name works as long as it matches `CALLBACKS` in
your config; TD operator names can't contain hyphens, so it won't literally be
`webserver-callbacks`.

**`webserver1`** — a **Web Server DAT**:

| Parameter | Value |
|---|---|
| `Active` | On |
| `Port` | `op.WebGuiServer.par.Port` |
| `Local Address` | **`127.0.0.1`** |
| `Callbacks DAT` | `webserver1_callbacks` |

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

WEBRTC = None
STREAMS = {}
```

Four things to get right:

**Paths are absolute.** These lookups run from *inside* `WebGuiServer`, so a
bare name resolves against the component rather than your project. Always start
with `/`.

**Custom parameters are Capitalized, built-ins are lowercase.** `Intensity` is
a custom par; `device` and `mode` are TD built-ins. Getting the case wrong is a
silent no-op on the broadcast path.

**`number[]` names the ParGroup, not a component.** Write `Color`, not `Colorr`.
The ParGroup's component order *is* the array order on the wire.

**`pulse` is not a value.** Pulse entries are excluded from snapshots and are
fired by the separate `pulse` message. Don't register a pulse par as `bool`.

The registry's names must match the keys of your TypeScript schema on the web
side. Nothing checks that for you — see
[protocol.md § Keeping the two sides in sync](protocol.md#keeping-the-two-sides-in-sync).

## 4. Add the Parameter Execute DAT

This is what pushes TD-side edits back to the browser. Without it, the web can
write to TD but never sees a change made in TD — a bridge that looks half broken.

Create a **Parameter Execute DAT** anywhere (near the operators it watches reads
best). Load
[`touchdesigner/parameter-execute.py`](../touchdesigner/parameter-execute.py)
into it, again with **Sync to File** on.

| Parameter | Value |
|---|---|
| `Active` | On |
| `OPs` | Every operator your registry references, space-separated. Patterns work: `/GUI/Scene* /GUI/GUI` |
| `Value Change` | On |
| `Custom` | On |

Turn on `Built-In` as well if you registered any built-in parameters (an Audio
Device In CHOP's `device`, say).

Edits that arrive *from* the web flow through here too — the callbacks set
`par.val`, which fires this DAT — so there is one broadcast path for both
directions rather than two that can disagree.

## 5. Verify

Start your web app and watch TD's textport. A healthy connect logs nothing at
all; every failure mode below prints a specific warning.

| Symptom | Cause |
|---|---|
| `no global OP shortcut 'WebGuiServer'` | Step 1 — the shortcut isn't set. |
| `WebGuiServer has no 'config' DAT` | The Text DAT isn't named exactly `config`, or `Config File` is empty. |
| `operator '...' not found - REGISTRY paths should be absolute` | A registry path is missing its leading `/`. |
| `operator '...' has no par '...'` | Wrong case (`intensity` vs `Intensity`), or the par doesn't exist. |
| `has no ParGroup '...'` | A `number[]` entry names a component (`Colorr`) instead of the group (`Color`). |
| Web can write, but TD-side changes never appear | Step 4 — the Parameter Execute DAT is missing, inactive, or its `OPs` doesn't cover that operator. |

More in [troubleshooting.md](troubleshooting.md).

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

**`webrtc1_callbacks`** — a Text DAT holding
[`touchdesigner/webrtc-callbacks.py`](../touchdesigner/webrtc-callbacks.py).

**`webrtc1`** — a **WebRTC DAT**:

| Parameter | Value |
|---|---|
| `Active` | On |
| `Callbacks DAT` | `webrtc1_callbacks` |
| `STUN Server URL` (ICE page) | **empty** |
| `TURN Server` (ICE page) | **empty** |

Leave STUN and TURN empty. Browser and TD are on the same machine, so ICE only
ever needs host candidates, and skipping the servers keeps gathering near-instant
when several peers come up at once.

> Those host candidates are *not* `127.0.0.1` in practice — Chrome emits an mDNS
> `.local` name and TD offers its LAN interface. They pair fine. Don't chase a
> non-loopback candidate as the cause of a failure.

**One Video Stream Out TOP per stream**, each with:

| Parameter | Value |
|---|---|
| `Mode` | `WebRTC` |
| `FPS` | A constant (e.g. `30`), **not** the default `me.time.rate` expression |
| `WebRTC` / `WebRTC Connection` / `WebRTC Video Track` | Left alone — the callbacks set these per peer |

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
  { id: 'mixer',  url: 'ws://localhost:9980' },
  { id: 'render', url: 'ws://localhost:9981' },
]
```

Schemas are per-instance, so each gets its own `createTDClient<Schema>()`. See
[api.md § Multiple instances](api.md#multiple-instances).

## Reference

| File | Edit? | Role |
|---|---|---|
| [`webserver-callbacks.py`](../touchdesigner/webserver-callbacks.py) | Never | Web Server DAT callbacks: parameters, menus, inbound signaling |
| [`parameter-execute.py`](../touchdesigner/parameter-execute.py) | Never | Parameter Execute DAT: TD → web broadcast |
| [`webrtc-callbacks.py`](../touchdesigner/webrtc-callbacks.py) | Never | WebRTC DAT callbacks: outbound signaling, `streams` announce |
| [`config-template.py`](../touchdesigner/config-template.py) | **Yes** | Your registry, wiring names, and stream map |

Registry entry fields:

| Field | Required | Meaning |
|---|---|---|
| `op` | Yes | Absolute path to the operator |
| `par` | Yes | Parameter name, or ParGroup base name for `number[]` |
| `type` | Yes | `'bool'` · `'number'` · `'string'` · `'number[]'` · `'pulse'` |
| `writable` | No (default `True`) | `False` refuses web writes with `param_not_writable`. Not sent to the web — the browser authors its own read-only set. |

A parameter in `EXPRESSION`, `EXPORT`, or `BIND` mode is refused whether or not
it's flagged, so `writable: False` is only needed for a `CONSTANT` par you want
to keep TD-driven. See
[design-notes.md § Parameter modes](design-notes.md#parameter-modes) for why that
guard protects your project and not just the user's edit.
