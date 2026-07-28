# Troubleshooting

Symptoms, in the order you're likely to hit them. Every TD-side message quoted
here appears in TouchDesigner's **textport** (Dialogs → Textport), and every
web-side one in the browser console.

- [Nothing connects](#nothing-connects)
- [Connects, but no parameters](#connects-but-no-parameters)
- [One parameter doesn't work](#one-parameter-doesnt-work)
- [One readout doesn't work](#one-readout-doesnt-work)
- [Web → TD works, TD → web doesn't](#web--td-works-td--web-doesnt)
- [Calls](#calls)
- [Dropdowns](#dropdowns)
- [Video](#video)
- [Reactivity and build](#reactivity-and-build)

## Nothing connects

**`status()` stays `connecting`, browser console shows repeated reconnects.**

Work down this list:

1. **Is TouchDesigner running, with the project open?**
2. **Is the Web Server DAT `Active`?**
3. **Does the port match?** The DAT's `Port` versus the `url` you passed the
   provider. `ws://localhost:9980` needs `Port` = `9980`.
4. **Are you using `ws://`, not `http://` or `wss://`?**
5. **Is the page served from `localhost`?** A page on a `file://` URL or another
   host can't open this socket.

**`status()` reaches `open` but never `synced`.**

The socket connected but the handshake didn't complete within the watchdog
window, so it's cycling through backoff. This is almost always a TD-side
exception during `hello` or `snapshot-request` — **check the textport**, where
the specific error will be waiting.

**Textport: `no global OP shortcut 'WebGuiServer'`**

The component's `Global OP Shortcut` (Common page) isn't set to `WebGuiServer`.
All three scripts find the component this way. See
[touchdesigner-setup.md § 1](touchdesigner-setup.md#1-create-the-webguiserver-component).

**Textport: `WebGuiServer has no 'config' DAT`**

The Text DAT holding your config isn't named exactly `config`, or the component's
`Config File` parameter is empty.

**Browser console: `protocol mismatch: web=1 td=2`**

The web and TD sides are from different releases. Non-fatal — the connection
proceeds best-effort — but expect message types one side doesn't understand.

## Connects, but no parameters

**`status()` is `synced` and every control is empty.**

`synced` means the snapshot arrived, so the connection is fine and the snapshot
was empty or its names don't match. Check the `snapshot` frame in devtools
(Network → WS → Messages):

- **`params` is `{}`** — your `REGISTRY` is empty, or every entry's backing
  operator is missing. The textport will name each one.
- **`params` has values, but under different names** — the registry keys and your
  TypeScript schema keys have drifted. They must match exactly, including case.

**Browser console: `no TD connection in context`**

A bound component rendered outside its `<Provider>`. Components bind through
Solid context, so they must be descendants.

**Browser console: `no TD video peer in context`**

`<Video>` rendered under a provider that didn't opt into video. Pass
`video` or `video={{ receivers: N }}` to the `<Provider>`.

## One parameter doesn't work

Everything else syncs; one name doesn't.

**Textport: `operator '...' not found - REGISTRY paths should be absolute`**

A registry `op` is missing its leading `/`. These lookups run from _inside_ the
WebGuiServer component, so a bare name resolves against the component rather than
your project.

**Textport: `operator '...' has no par '...'`**

Wrong parameter name or wrong case. **Custom parameters are Capitalized
(`Intensity`); TD's built-ins are lowercase (`device`, `mode`).**

**Textport: `has no ParGroup '...'`**

A `number[]` entry names a component instead of the group. Write `Color`, not
`Colorr`.

**Error `param_type_mismatch`**

The value doesn't fit the registry entry's declared type. The message says which:

- _"expected a number, got …"_ — the registry says `number`, the schema says
  something else.
- _"expects N components, got M"_ — a `number[]` array-length mismatch. The
  ParGroup has N components; the web sent M.
- _"has no menu key 'x' - TD offers: …"_ — `<Select options>` has drifted from
  TD's actual menu. The message lists the real keys.

**Error `param_not_writable`, and the control goes disabled**

Expected behavior, not a bug. Either the registry marked it `writable: False`, or
the backing parameter isn't in `CONSTANT` mode — it's driven by an expression, a
CHOP export, or a bind. The web reverts the optimistic edit and disables the
control from then on.

**This guard is protecting your project.** Writing to an expression-driven
parameter would permanently detach its expression, not merely fail. See
[design-notes.md § Parameter modes](design-notes.md#parameter-modes).

If you _want_ the web to drive it, switch the parameter to `CONSTANT` in TD, or
author the control as a `<Value>` readout instead.

**Error `unknown_param`**

Either the name isn't in `REGISTRY` or `READOUTS`, or you sent the wrong kind of
message for it — an `update` aimed at a `pulse` entry. Use
`<Button mode="pulse">` for pulse parameters.

## One readout doesn't work

Readouts are `READOUTS` entries — CHOP channels, DAT cells, whole DAT tables —
with no parameter behind them. They arrive in the same `snapshot`/`update` as
parameters, so the sections above apply too; these are the readout-specific ones.

**Textport: `readout '...': '...' is a DAT, but this entry reads a CHOP`**

The entry's shape and the operator disagree: a `chan` entry pointing at a DAT, or
a `row`/`col` entry pointing at a CHOP.

**Textport: `readout '...': '...' has no channel '...'`**

The CHOP resolves but that channel doesn't exist on it. Channel names are
case-sensitive, and a renamed channel fails silently on the TD side otherwise.

**Textport: `readout '...' names only an operator`**

A whole-table entry missing its `'type': 'string[][]'`. An entry naming only an
operator is indistinguishable from one whose `chan` you forgot, so it has to say
which it means.

**Textport: `readout '...' reads a cell, which can be 'string' or 'number' - not 'bool'`**

There's no guess-free string → bool cast — `"false"` is truthy — so a cell can't
be declared `bool`. Convert it in TouchDesigner (an Evaluate DAT, or a DAT to
CHOP feeding a channel readout) and read the result instead.

**Textport: `'...' is in both REGISTRY and READOUTS`**

A name collision. The `REGISTRY` entry wins and the readout is ignored, because
dropping the parameter would silently break writes. Rename one of them.

**Error `param_not_writable` on a name you know is a readout**

Working as intended — readouts are TD → web only. Bind them with `<Value>` or
`<Table>` and list them in the provider's `readonly` so the control is disabled
from the start rather than after the first refused edit.

**A readout never updates, but shows a value on connect**

The snapshot works and the watcher doesn't. Check for a `chopexec_…` or
`datexec_…` DAT for that operator inside `WebGuiServer`, then run
`op.WebGuiServer.Rebuild()` — same diagnosis path as the `parexec_…` DATs below.

**A readout updates far more often than expected**

Expected, up to one message per frame. Everything dirtied in a frame is coalesced
into a single end-of-frame `update`, but a channel that changes every frame is
still 60/sec. Resample or filter the CHOP in TouchDesigner; there is deliberately
no rate setting in the config. See
[design-notes.md § Readouts](design-notes.md#readouts).

**A table readout syncs nothing at all, and the whole UI is empty**

Check the web-side `td-core` version. **0.1.0** validated `params` all-or-nothing,
so a snapshot containing a `string[][]` drops wholesale there. Upgrade the web
side, or drop the table readout. Projects with no whole-table readouts are
unaffected. See
[protocol.md § A bad value drops its entry](protocol.md#a-bad-value-drops-its-entry-not-the-message).

## Web → TD works, TD → web doesn't

Editing in the browser moves the parameter in TD, but editing in TD does nothing
in the browser.

**This is almost always the generated watcher DATs.** They live inside
`WebGuiServer`: `parexec_…` (one per operator your `REGISTRY` references),
`chopexec_…` and `datexec_…` (one per operator your `READOUTS` references). The
checks below read the same for all three. Check, in order:

1. There is one for the operator in question. If the component has none at all,
   the extension isn't wired — see setup step 4.
2. Run `op.WebGuiServer.Rebuild()` and re-read the textport. It reconciles
   against the live network and warns about registry entries it can't resolve.
3. The registry entry names an operator that exists, spelled absolutely. An
   entry pointing at a missing operator generates a watcher that watches nothing.
4. `Td Core Dir` on the component is set. Empty, and the generated DATs can't
   resolve their callback scripts (`parameter-execute.py`, `chop-execute.py`,
   `dat-execute.py`), so they have no code to run.

Don't hand-edit a generated DAT's parameters to fix this — `Rebuild()`
overwrites them. Fix the config entry instead.

**Textport: `WebGuiServer has no DAT '...' - check CALLBACKS in the config DAT`**

`CALLBACKS` in your config doesn't match the callbacks DAT's actual name. TD
operator names can't contain hyphens, so it won't literally be
`webserver-callbacks`.

**It worked, then stopped after you edited a DAT.**

Re-cooking the callbacks DAT rebuilds its module and empties the `clients` set
while the sockets stay open, so broadcasts go nowhere. It self-heals within one
heartbeat interval (~5s) — the next inbound message re-registers the client. Wait
a beat before investigating.

## Calls

**A `call()` never resolves — the Promise just hangs.**

It doesn't hang forever: it rejects `call_timeout` after `callTimeout` (default
10s). If you're seeing that, work down this list:

1. **Is the name actually in `HANDLERS`?** A typo'd name replies
   `unknown_handler` immediately rather than timing out — so a _timeout_
   specifically means TD never got the message at all, or a handler raised
   before it could reply and the reply itself failed to arrive.
2. **Is the socket actually `synced`?** A `call()` sent while disconnected
   rejects `call_disconnected` immediately, but one sent right before a drop
   can be in flight when the socket closes — same rejection, different timing.
3. **Check the Textport for a traceback.** A handler that raises still replies
   `handler_error` (see below) — a true no-reply hang means the handler itself
   never returned, e.g. it's blocking on synchronous I/O or an infinite loop on
   TD's main thread, which also freezes the rest of the project. That's the
   bug to fix, not the call.

**Error `unknown_handler`**

The name isn't in `HANDLERS` (web → TD) or wasn't registered with
`createTDHandler`/`connection.handle()` (TD → web) at the time the call
arrived. For the TD → web direction specifically, check that the component
calling `createTDHandler` is actually mounted — it unregisters on unmount, so
a call arriving after the component that owned the handler went away gets this
same error rather than being silently dropped.

**A handler's exception shows up as `handler_error`, not a crash**

Expected — both sides catch around the invocation so a broken handler can't
take the socket down. **Check the Textport** for the TD-side traceback, or the
browser console for the web-side one; the `result` reply's `error.message`
usually has just the exception text, not the full trace.

**Error `result_not_serializable`**

The handler's return value isn't valid JSON — a TD object (an `OP`, a `Par`), a
Python object with no JSON encoding, a circular structure, `NaN`/`Infinity`.
Convert it to plain data (`str(op_ref.path)`, a dict/list of primitives) before
returning it.

**`parent.WebGuiServer.Call(...)` invokes `on_error('call_disconnected', ...)` immediately**

TD's outbound `call()` needs exactly one connected client to reply to — with
zero or more than one browser connected, there's nothing to guess at, so it
refuses immediately rather than picking one. Use `Notify()` instead if you
don't need a reply and want to reach every connected client, or pass an
explicit `client=` if you have one in hand (e.g. from `onWebSocketOpen`).

## Dropdowns

**`<Select>` is empty.**

With no `options` prop, the dropdown uses the menu TD announces. TD only
announces `string` registry entries whose backing parameter actually has
`menuNames`. Check that the entry is typed `'string'` and points at a real Menu
parameter.

**The list is stale after plugging in hardware.**

Expected. Menu _contents_ changing raises no TouchDesigner callback — an open
Derivative bug. Add a button calling `connection.requestMenus()`, or poll from
TD. See [design-notes.md § Refreshing a stale menu](design-notes.md#refreshing-a-stale-menu).

**An option reads `"… (unavailable)"` and is disabled.**

TD's current value has no matching option — a device unplugged while selected, or
web-authored options that have drifted. Shown rather than dropped, because a
`<select>` asked to hold a value it doesn't have would display some _other_
option as though the user had chosen it.

## Video

**`<Video>` throws `no TD video peer in context`.**

The provider didn't opt into video. Pass `video` to it.

**Peer connects, tiles stay black.**

The classic case. In order of likelihood:

1. **`source` is wrong, or doesn't cook.** The generated `select_<id>` inside
   `WebGuiServer` carries the error, and its viewer shows exactly what is being
   encoded.
2. **The chain was never generated.** Textport: _"no generated Video Stream Out
   TOP for stream 'x'; call op.WebGuiServer.Rebuild()"_.
3. **No NVIDIA GPU, or not on Windows.** The Video Stream Out TOP requires
   NVIDIA's hardware encoder. There is no software fallback.
4. **Over 8 encoder sessions on a GeForce card.** That's a hard per-system limit.

Note the peer will read `connected` in all of these — media is negotiated
independently of whether pixels flow, which is why `streamStatus(id)` per tile is
more informative than `status()`.

**Fewer tiles than expected.**

Textport: _"N stream(s) configured but the SDP carries M video m-line(s)"_. An
answerer cannot add m-lines, so `receivers` on the web side is the ceiling. Raise
it to at least your `STREAMS` count:

```tsx
<App.Provider url={url} video={{ receivers: 8 }}>
```

**Every tile shows the same picture.**

If you're on the bundled `td-core`, this is already handled — it wraps each track
in its own `MediaStream`. If you see it, you're binding `event.streams[0]`
somewhere yourself: TD announces every track of a peer inside one `msid`, so that
object is identical on every `mid` and a `<video>` plays only its first video
track.

**The image is mirrored.**

TD's encoder mirroring is already corrected downstream of `source`, so a mirrored
tile means your own chain is flipping too and the two cancel out. Take the flip
out of your chain — and never compensate with a CSS transform, which Chrome drops
in fullscreen.

**A second browser froze the first one's tiles.**

By design, and reported: the newcomer receives a `video_single_viewer` error. One
Video Stream Out TOP holds one connection, so serving two browsers simultaneously
needs a second full set of TOPs.

**Video drops when the WebSocket blips.**

It shouldn't — media rides its own transport and only dead peers are rebuilt on
reconnect. If a healthy peer is being torn down, check that nothing in your app
is remounting the `<Provider>` on a status change.

## Reactivity and build

**Signals don't update; nothing is reactive.**

Almost certainly **two copies of `solid-js`**. `td-core` declares it as a peer
dependency precisely so there's one reactive graph; a second copy silently breaks
everything.

```sh
npm ls solid-js     # or: pnpm why solid-js
```

Deduplicate to a single version. With pnpm, check for a stray `solid-js` in a
nested `node_modules`.

**Build fails on JSX inside `node_modules/td-core`.**

The package ships **JSX-preserving** output — your compiler is meant to transform
it, in the same pass as your own components. Make sure `vite-plugin-solid` (or
your Solid toolchain) is configured, and that it isn't excluding `node_modules`
from transformation. Bundlers must resolve the `solid` export condition.

**Types don't resolve.**

The package's `exports` map carries `types`. If your `tsconfig.json` uses
`"moduleResolution": "node"` (the legacy algorithm), it won't read that map — use
`"bundler"` or `"node16"`.
