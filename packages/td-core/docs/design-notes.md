# Design notes

Why `td-core` works the way it does. Most of this is invisible in normal use —
read it when a default surprises you, when you're extending the library, or
before changing something that looks arbitrary.

Several sections record behavior **measured against TouchDesigner 2025.33070**
that contradicts the obvious assumption. Those are marked, and they are the ones
worth reading first.

- [Scope and targets](#scope-and-targets)
- [Security model](#security-model)
- [The web authors its schema](#the-web-authors-its-schema)
- [Parameter modes](#parameter-modes)
- [TD-announced menus](#td-announced-menus)
- [Optimistic writes and echo suppression](#optimistic-writes-and-echo-suppression)
- [One signal per name](#one-signal-per-name)
- [Outbound rate limiting](#outbound-rate-limiting)
- [Connection resilience](#connection-resilience)
- [Video](#video)
- [Headless styling](#headless-styling)
- [Non-obvious TouchDesigner behavior](#non-obvious-touchdesigner-behavior)

## Scope and targets

`td-core` is built for a **single closed system**: the web UI, every TD instance,
and the browser all run on the same trusted machine, and the app is never
deployed remotely.

- **Desktop Firefox and Chrome only.** No mobile, no WebKit target. WebRTC,
  autoplay, secure-context, and pointer-event behavior only have to hold on
  current desktop Gecko and Blink.
- **Up to 8 video streams visible at once**, at ≤720p / ≤30fps.
- **Video is TD → web only** in v1. Audio, webcam/mic web → TD, and WebRTC data
  channels are out of scope — the `<Video>` and peer design doesn't preclude them
  later.
- **Static instance configuration.** The app declares a known list of
  `{ id, url }` up front; connections open on mount. No runtime discovery.

Running outside those assumptions mostly still works, but nothing here is tested
against it.

## Security model

**There is no authentication.** The protocol has no notion of a credential, and
anything that can reach the Web Server DAT can drive your project's parameters.

That's safe only because of a deliberate setting: the Web Server DAT's
`Local Address` is set to **`127.0.0.1`**, so it's reachable only from the local
machine. **Left blank, TD's Web Server DAT listens on all interfaces** — this is
a setting you must make, not a default you inherit.

The rest follows from that bind:

- **Plain HTTP and `ws://`.** The page is served from `http://localhost`, so it
  can open `ws://localhost:<port>` with no mixed-content blocking and no TLS.
- **`RTCPeerConnection` works anyway.** Browsers treat localhost as a secure
  context, so WebRTC video needs no HTTPS.

Serving this app to other machines would mean revisiting the bind address, `wss`
/ HTTPS, and authentication — all of it. Don't do it by half.

## The web authors its schema

**TouchDesigner is never introspected to build the UI.** Your TypeScript schema
and TD's `REGISTRY` are both hand-authored, and neither is derived from the other.

The alternative — the web reading TD's network to discover parameters — was
rejected because it couples the UI to TD's node layout, makes type-checking
depend on a live connection, and turns every operator rename into a UI break.
Friendly names on the wire (`intensity`, not `/project1/level1/opacity`) exist
for the same reason.

The accepted cost is that the two declarations must be kept in sync by hand. See
[protocol.md § Keeping the two sides in sync](protocol.md#keeping-the-two-sides-in-sync)
for exactly how each kind of drift fails.

This stance shows up in three places, and is broken exactly once:

| Thing | Authored where | Why |
|---|---|---|
| Parameter names and types | Web schema + TD registry | No introspection |
| `<Select>` options | Web (`options` prop) | No introspection |
| Read-only parameters | Web (`readonly` prop) | No introspection; no wire-format change |
| **Menu options** | **TD (`menus` message)** | **Some menus cannot be authored — see below** |

If TD ever needs to drive *more* metadata to the web (`min`/`max`/labels/units),
the escape hatch is a dedicated message alongside the snapshot — deliberately not
folded into `snapshot`, which stays a flat `{name: value}` map in both directions.
`menus` is what that hatch looks like.

## Parameter modes

A TD parameter has a mode — `CONSTANT`, `EXPRESSION`, `EXPORT` (CHOP-driven), or
`BIND` — and the wire format deliberately hides it. The web only ever sees clean
values.

**Reads are mode-agnostic.** `par.eval()` returns the evaluated result in every
mode, so snapshots, broadcasts, and `<Value>` readouts reflect an
expression-driven parameter correctly with no special handling.

**Writes are guarded, and this is a data-safety measure — not a UX nicety.**

> **Measured on 2025.33070:** assigning `par.val` to an `EXPRESSION`- or
> `EXPORT`-mode parameter **flips it into `CONSTANT` mode**, and the expression
> stops driving it permanently. The text survives in `par.expr` but nothing
> evaluates it any more, and TD raises no Python error.

The intuitive assumption — that such a write quietly no-ops, leaving the user
with an edit that reverts for no visible reason — is wrong, and the truth is
much worse. **A single web write silently detaches a TD author's work, and the
damage outlives the browser session that caused it.** That's why the DAT
callbacks refuse the write rather than attempting it.

`BIND` is refused alongside them. A two-way bind was measured to *propagate* the
write to its master rather than break, so it isn't uniformly read-only the way
the others are — but it can't be assumed writable either, and refusing is the
recoverable direction: a visible error beats silently driving something the web
may not own.

**`pulse` is deliberately not mode-guarded.** `par.pulse()` was measured to leave
the mode untouched — an `EXPRESSION` parameter is still `EXPRESSION` afterwards —
so it can't detach anything. It honours the registry's `writable` flag only.

Two complementary layers keep this from being a silent failure:

1. **Static, web-side (preventive).** The `readonly` set is authored beside your
   schema, so a control bound to a read-only name renders disabled and warns in
   dev — or you author it as `<Value>` outright and it never even produces an
   error. Being a web-side decision means **no wire-format change**.
2. **Runtime, TD-side (safety net).** The static set can't see a parameter whose
   mode changes after startup, and an app can simply forget to list one. So the
   write callback also checks `par.mode` and, if it isn't `CONSTANT`, skips the
   write and emits `param_not_writable`. The web marks that name read-only from
   then on and re-requests a snapshot, so the optimistic edit that never landed
   snaps back to TD's real value instead of sticking.

For array parameters the check is **per component**, so a half-constant ParGroup
(`Positionx` constant, `Positiony` expression) is refused whole rather than
half-applied.

## TD-announced menus

The no-introspection rule holds everywhere the web *can* author what it needs.
Menu options are the one place it sometimes can't.

The motivating case is an audio-device dropdown. Read off a real machine:

```
key:   {0.0.1.00000000}.{feb5e51a-d9cd-45c0-8aff-4770ba283ba0}||Voicemeeter_Out_A4_(VB-Audio_Voicemeeter_VAIO)||1
label: Voicemeeter Out A4 (VB-Audio Voicemeeter VAIO)
```

Nothing about that is authorable ahead of time: the keys are machine-specific and
the list changes when hardware is plugged in. The usual "keep the web `options`
in sync" bargain isn't merely tedious here, it's impossible — **which is the test
for whether a menu belongs in this exception.**

Design points, each load-bearing:

- **A separate message, not part of `snapshot`.** `snapshot` stays a flat map,
  and a changed device list can be re-announced without resending every value.
- **Sent before the snapshot**, so a `<Select>` never briefly holds a value with
  no matching option.
- **The `options` prop always wins.** Adding announcements to a TD project cannot
  change what an existing `<Select>` renders.
- **Re-announcing replaces the list wholesale.** A merge would leave an unplugged
  device selectable forever.
- **No registry flag drives it.** TD announces any menu-backed `string`
  parameter, because a par either has `menuNames` or it doesn't and asking TD
  beats asking an author to remember. `bool` entries are excluded even though TD
  Toggles also carry `menuNames` (`['off','on']`) — they travel as bools and
  render as checkboxes.
- **The value/label split is required.** A dropdown showing raw GUIDs would be
  unusable.

### Refreshing a stale menu

> **This is an open TouchDesigner bug, confirmed present on 2025.33070.**
> Menu *contents* changing raises **no callback**. A Parameter Execute DAT fires
> on a parameter's value, mode, enable, and export; plugging in an audio
> interface changes none of them — the value is untouched and only the set of
> legal values grows.

The obvious workaround does not work, and it's worth not spending an afternoon
rediscovering that: a **Parameter DAT** with Menu Names/Labels output, watched by
a **DAT Execute**, fires `onTableChange` **zero** times when `menuNames` changes,
and **once** when the same parameter's *value* changes. So the wiring is sound
and the menu change genuinely doesn't notify. Derivative logged this in April
2021 ([forum thread](https://forum.derivative.ca/t/breaking-binding-a-dropdown-menu-out-to-a-perform-ui/13123),
where staff confirm the members "should be dependable") and it is still open. The
DAT's content *is* fresh whenever you pull it; what never arrives is the nudge to
pull.

So something has to look again. Three ways, best first:

**0. The pulse that causes the change** — when a TD *action* rebuilds the menu (a
Screen Grab TOP's *Refresh Sources*, say), hook that pulse with `onPulse` and
re-announce. A real event: no poll, no button. Audio devices don't qualify, since
the OS changes that list rather than a parameter.

**1. `menus-request` (web → TD)** — the default. A "Reload devices" button calls
`connection.requestMenus()`; TD re-reads and answers. The person who just plugged
the device in is right there, so asking on demand is cheaper and more predictable
than guessing. Deliberately separate from `snapshot-request`: refreshing a device
list shouldn't drag every parameter value along with it.

**2. A TD-side poll** — for menus that must refresh with nobody watching. Wire
`broadcast_menus_if_changed()` to an Execute DAT's `onFrameStart`, gated to run
every second or two:

```python
def onFrameStart(frame):
    if absTime.frame % 120:   # ~2s at 60fps
        return
    op.WebGuiServer.op('webserver1_callbacks').module.broadcast_menus_if_changed()
```

**Not wired up by default**, because it costs a `menuNames` read per registered
menu parameter per tick, forever, for something most projects never need.

Both funnel through the same diff, which is what makes either safe to call
freely — an unchanged list sends nothing, so no client is woken for a no-op. A
*real* change is broadcast to **every** client, not just the requester: a new
device is news for every open browser.

## Optimistic writes and echo suppression

A control writes its own signal immediately on user input, before any TD echo, so
the UI never waits a round trip. That's only safe because of the second half:

**The local edit wins while the control is focused or being dragged.** Inbound
values for that parameter are ignored until blur, so the value and cursor can't
jump out from under the user. TD's echo of the value you just sent is therefore
harmless, which is why the wire carries no origin tags or timestamps.

Blur, live updates, or a reconnect snapshot reconcile if the two ever diverge.
`pulse` is the one exception — it holds no state, so there's nothing to update
optimistically.

**Suppression is a count, not a flag.** The signal tracks how many bound
components are actively editing. A browser focuses one element at a time so in
practice it's 0 or 1, but the count is the correct generalization — it handles a
slider drag overlapping a focused input with no special case.

If you write a custom control, every `beginEdit()` needs a matching `endEdit()`.
An unbalanced pair leaves the parameter permanently deaf to TD.

## One signal per name

Parameters are a **broadcast bus**: TD sends every exposed change to every client,
most of it for names a given client isn't bound to. Across 8 instances at 60fps
that's a steady inbound stream. Three things keep it cheap:

**Lazy allocation.** A signal exists only for a name something has actually
bound. The connection's routing table maps name → signal, and an inbound update
for an unbound name is a map miss — dropped with no allocation and no reactive
work. Dispatch cost scales with what your app *uses*, not with everything TD
broadcasts.

**Shared signals.** All binders of a name share one signal, so a TD update fans
out to every bound component and an optimistic write from one is instantly
visible in the others. Binding several components to one parameter — a slider
beside a `<Value>` readout, a slider plus a number input, the same control
mirrored in a header and a detail panel — is a supported feature that falls out
of this, not an accident.

`min`/`max`/`step` are **view-level, not stored**: the shared signal holds the raw
value and each component clamps its own display and sends. Two controls with
different ranges on one parameter are just different windows onto one value.

**Batched application.** Each message's whole `params` map is applied inside
Solid's `batch()`, so one message causes at most one reactive flush regardless of
how many parameters it carries.

Once allocated, a signal lives for the connection's lifetime. The parameter
universe is small and static, so this avoids churn as controls mount and unmount.

**There is no inbound throttle.** Fine-grained reactivity means only changed,
bound signals touch the DOM, and per-instance sockets spread the parse work. If
inbound dispatch ever profiles as a cost, a coalesce-per-frame step can be added
with no wire-format change.

## Outbound rate limiting

High-frequency controls throttle sends to one rAF-aligned message per frame. The
optimistic local write stays immediate — only the wire send is deferred — so
nothing feels laggy.

**Backpressure-aware, not just rate-limited.** The rAF throttle bounds send
*frequency* but not the socket's send buffer. If TD stops draining the socket — a
re-cooking DAT, a stalled `.toe` — `bufferedAmount` grows without bound while
controls keep posting at 60fps, and across 8 instances that compounds. So the
outbound path also checks `bufferedAmount` against a high-water mark and skips
`update` sends while over it.

**Dropping is correct here.** Only the latest value matters; the next frame's
coalesced value supersedes anything skipped. Sustained congestion flips the
reactive `congested` flag and, past a longer threshold, is treated like a
half-open socket and forces a reconnect.

`pulse` is exempt from coalescing but still respects the buffer: a pulse fired
into a congested socket is dropped and debug-logged rather than queued behind
stale data.

### Invalid and empty numeric input

Numeric controls **never send `NaN`**. While a field is empty or unparseable
mid-edit, the component holds the last valid value and sends nothing, so TD keeps
showing the last good value rather than receiving garbage. On blur, an empty or
invalid field snaps back to the signal's current value so display and TD can't
drift apart. `min`/`max` clamp before sending.

## Connection resilience

**Outbound sends while disconnected are dropped, not queued.** Buffering would
fight the snapshot resync that immediately follows reconnect — replaying a stale
slider position only to have the snapshot overwrite it (or vice versa) is just a
race. The snapshot is the authoritative baseline, and a still-focused input
re-sends naturally on its next change. A pulse fired into a dead socket is simply
lost, which is the correct semantics for a missed button press.

**The handshake needs its own watchdog.** A socket opening is not the same as TD
being ready to talk. If the TD-side callback throws or never replies, the
connection would sit un-`synced` forever — the `ping`/`pong` heartbeat only
guards an *already established* session. So a watchdog requires `welcome` **and**
`snapshot` within a window of `onopen`, and otherwise abandons the attempt into
the normal backoff path rather than wedging.

**Backoff uses half jitter** — a random point in the upper half of `[0, base]` —
so retries spread out across up to 8 instances instead of stampeding, while still
growing toward the ceiling. A healthy sync resets the schedule.

**Stale sockets can't drive a reconnect.** Each attempt gets a monotonic id, and
a torn-down socket's late `close`/`error` events guard on it.

**Teardown is complete or it leaks.** A provider owns disposable, non-GC-able
resources, and at 8 instances a leak compounds fast. Unmounting closes the
socket, cancels every timer (reconnect, watchdog, ping/pong, congestion, rAF
frame), closes the peer, calls `stop()` on every received track so the browser
frees the hardware decoder — a detached `<video>` alone does not — and drops the
routing table.

## Video

### One peer per instance

An instance's peer carries **all** of that instance's tracks, rather than one peer
per stream. That keeps connection and ICE overhead down when an instance serves
several streams, and it's why `<Video stream="…">` selects by id rather than by
connection.

Streams are addressed by explicit id, so there is no fixed stream-to-instance
mapping — some instances emit several, others one or none.

### The browser offers

Resolved deliberately: the browser sends the initial SDP offer, on connect and on
rebuild alike, expressing interest as `recvonly` video transceivers.

Only the browser knows when it wants a peer — first sync, or a rebuild after a
failure — and browser-offers needs no "please offer" message to prod TD into
starting. That keeps the connect and rebuild paths identical.

**TD still offers for its own renegotiations**, and that isn't a contradiction:
only an offerer can add m-lines, so a TD instance that starts a new track has to
drive that exchange itself. Inbound offers are therefore handled for the whole
life of the peer, and a collision with our own in-flight offer is resolved by the
browser yielding — rollback, then answer.

`offerRole: 'td'` flips the initial role in one option; the answer path is
already implemented either way.

### Rebuild, don't ICE-restart

On localhost the failure modes aren't network glitches, they're **TD-side
events**: a `.toe` reload, the WebRTC DAT re-cooking, an instance restart. An ICE
restart can't fix one end going away entirely, so `failed` — and `disconnected`
past a short grace — tears down and rebuilds the peer from scratch.

Status stays `reconnecting` across the rebuild rather than dropping back to
`connecting`, so an overlay doesn't flicker off while the replacement negotiates.

### A WebSocket blip must not kill video

Media rides its own transport, so an established peer keeps flowing video through
a brief WebSocket hiccup. Video is **not** torn down when the socket drops.
Instead, on reconnect each peer's `connectionState` is checked and only dead ones
are rebuilt.

**Renegotiation deferred across the gap.** Renegotiation *needs* the signaling
channel, so a negotiation requested while the socket is down is recorded rather
than dropped, and the same reconnect hook flushes it on still-alive peers. That
closes the gap between "media survives a blip" and "tracks can change at any
time."

### No STUN or TURN

Browser and TD share a machine, so ICE only ever needs host candidates. Empty
`iceServers` also makes gathering near-instant when 8 peers come up at once.
Kept as an option in case TD ever runs on another box.

> Those host candidates are **not** `127.0.0.1` in practice: Chrome emits an mDNS
> `.local` name (it hides local IPs by default) and TD offers its LAN interface.
> Both resolve locally and pair fine. Don't treat a non-loopback candidate as the
> cause of a failure.

## Headless styling

`td-core` ships **zero CSS**. Components render bare HTML elements with stable
class hooks and pass everything through. This is what makes the library droppable
into a project with its own design system, and it means there is no stylesheet to
import, override, or fight.

`solid-js` is a **peer dependency**, never bundled — bundling it would create a
second reactive graph and silently break signal reactivity. The build is
**JSX-preserving** (`dist/*.jsx` under the `solid` export condition), so your
compiler turns the JSX into Solid's reactive DOM calls in the same pass as your
own components. Pre-compiled DOM output would defeat that.

## Non-obvious TouchDesigner behavior

Findings that cost real debugging time. All measured on 2025.33070.

**`par.val` on an expression-driven parameter is destructive.** It flips the mode
to `CONSTANT` and permanently detaches the expression. See
[Parameter modes](#parameter-modes).

**An unknown menu key silently selects entry 0.** Assigning a Menu parameter a
key it doesn't have raises nothing and takes its *first* entry — and the
Parameter Execute DAT then broadcasts that value back as though the user had
chosen it. Since `<Select>` options are web-authored by design, drift is an
expected failure, so writes validate against `par.menuNames` first and return
`param_type_mismatch`.

**`menuNames` changes fire no `onTableChange`.** An open Derivative bug since
2021. See [TD-announced menus](#td-announced-menus).

**Built-in parameters are lowercase; custom parameters are capitalized.**
`webrtc`, `mode`, and `device` are built-ins; `Intensity` and `Color` are custom.
Getting this backwards fails silently.

**`addTrack` must precede `createAnswer`.** Skip it and the answer negotiates
perfectly happily, but its video m-line comes back `a=inactive`: a live-but-muted
receiver, a peer that reaches `connected`, and no error on either side. Pointing
the Video Stream Out TOP at the track is a *separate* step — its
`webrtc`/`webrtcconnection`/`webrtcvideotrack` parameters are menus that only
select among tracks that already exist, and they must be set a frame later, once
the DAT has cooked and published those menus.

**TD announces every track of a peer inside one `msid`.** So `ontrack`'s
`event.streams[0]` is the same N-track object on every `mid`, and a `<video>`
plays only the first video track of whatever it's handed — an 8-tile wall shows
tile 1 eight times, with no error anywhere. `td-core` wraps each track in its own
`MediaStream` keyed by `mid`. Invisible at one stream, which is why it survived
until the wall was built.

**TD's WebRTC output arrives mirrored in X**, even though the TD viewer shows the
source correctly. Fix it with a Flip TOP at the encoder, not a CSS transform —
Chrome drops the styling in fullscreen and the mirror returns.

**One Video Stream Out TOP serves one peer.** Its `WebRTC Connection` parameter
holds a single value, so a second browser takes the stream and the first one's
tiles freeze while its peer stays `connected`. The callbacks make this visible
with a `video_single_viewer` error rather than leaving it to be inferred from
frozen pixels.

**Video Stream Out TOP needs an NVIDIA GPU on Windows**, and GeForce cards cap
the machine at 8 simultaneous encoder sessions.

**`<For>` recycles `<option>` elements in place.** When a menu's list changes, the
browser keeps the selected *index* while the values shift underneath, silently
showing a neighbouring device as selected. `<Select>` binds `selected` per option
so selection follows the data. An effect re-asserting `select.value` does *not*
fix this — it runs before `For` updates the DOM.

**`muted` must be set as a property, not a JSX attribute.** The `muted` content
attribute only seeds `defaultMuted`, which does nothing for an element created
after parse — leaving the video unmuted, and so blocked from autoplaying.
