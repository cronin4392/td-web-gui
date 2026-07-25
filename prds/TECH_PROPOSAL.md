# Tech Proposal: TD Web GUI

## Overview

Web UI that communicates bidirectionally with TouchDesigner for control data (text, numbers, messages) and receives real-time video from TD.

The web UI talks to **multiple TD instances running on the same machine** — each TD process hosts its own Web Server DAT on a distinct port, so the app maintains one independent WebSocket (and WebRTC peer) connection per instance.

## Tech Stack

### Frontend

**Solid.js** (TypeScript, Vite)

- Fine-grained reactivity via signals — WebSocket messages update only the exact DOM nodes bound to changed values
- No virtual DOM overhead; ideal for high-frequency TD parameter updates
- Small bundle size

### Communication

| Channel | Protocol | TD Component | Browser API |
|---|---|---|---|
| Text / numbers / messages (bidirectional) | **WebSocket** | Web Server DAT or WebSocket DAT | Native `WebSocket` |
| Video (TD → Web) | **WebRTC** | WebRTC DAT + Video Stream Out TOP | Native `RTCPeerConnection` |
| WebRTC signaling (SDP/ICE) | **WebSocket** (multiplexed) | same WebSocket connection | same `WebSocket` |

WebRTC is a **core v1 feature**, not deferred. Its signaling (SDP offer/answer + ICE candidates) is **multiplexed over the same WebSocket** connection used for control data — one connection to manage, no extra TD components or second socket.

v1 media scope is **video TD → Web only**. Audio, webcam/mic Web → TD, and WebRTC data channels are explicitly out of scope for v1 (the `<Video />` / peer-connection design should not preclude them later).

### Architecture

```
┌─────────────────────────────────────┐
│  Any Solid.js Project               │       ┌─────────────────────┐
│                                     │       │ TD instance "a"     │
│  ┌───────────────────────────────┐  │◄─WS──►│ :9980 Web Server DAT│
│  │  td-core (reusable lib)       │  │◄WebRTC│       WebRTC DAT     │
│  │  • createTDClient<S>() factory│  │       └─────────────────────┘
│  │     ↳ createTDConnection()    │  │       ┌─────────────────────┐
│  │     ↳ createTDVideoStream()   │  │◄─WS──►│ TD instance "b"     │
│  │     ↳ <Video />, controls     │  │◄WebRTC│ :9981 Web Server DAT│
│  │                               │  │       │       WebRTC DAT     │
│  └───────────────────────────────┘  │       └─────────────────────┘
│                                     │       ┌─────────────────────┐
│  ┌───────────────────────────────┐  │◄─WS──►│ TD instance "c"     │
│  │  Project-specific UI          │  │◄WebRTC│ :9982 ...           │
│  │  (consumes td-core signals)   │  │       └─────────────────────┘
│  └───────────────────────────────┘  │   (one WS + peer per instance,
└─────────────────────────────────────┘    signaling over each WS)
```

No backend server required for TouchDesigner communication — each TouchDesigner instance acts as its own server via its Web Server DAT (WebSocket, which also carries that instance's WebRTC signaling) and WebRTC DAT (video). *(This is specifically about the TD control/video channel. `apps/text-selector` separately runs a small persistence API alongside its own Vite dev/preview server — a Vite plugin backed by SQLite — for its phrase library, unrelated to TD; see [TEXT_SELECTOR.md §5](TEXT_SELECTOR.md#5-storage).)*

### Security & serving model

This runs on a **single closed system** — the web UI, all TD instances, and the browser are on the same trusted machine, and the app is **never deployed remotely** (no hosting, no other machines). Decisions follow from that:

- **Target browsers — desktop Firefox and Chrome only.** No mobile, no Safari/WebKit target, so WebRTC, autoplay, secure-context, and pointer-event behavior only need to hold on current desktop Gecko and Blink. This narrows the test matrix and means a few defensive attributes below (e.g. `<video playsinline>`) are belt-and-suspenders rather than load-bearing.

- **App served over plain HTTP from `localhost`** (Vite dev server, or any static host on the box). Because the page is `http://localhost`, it can open `ws://localhost:<port>` connections with no mixed-content blocking — no TLS / `wss` needed.
- **No authentication / authorization, enforced by a loopback bind.** The Web Server DAT (which also carries WebRTC signaling) is bound to **`127.0.0.1`**, not `0.0.0.0`, so it is reachable only from the local machine and there's no untrusted network surface to authenticate against. Auth is explicitly out of scope — but note the "closed system" guarantee is *enforced* by the loopback bind (and/or a host firewall), not merely assumed. TD's Web Server DAT can bind all interfaces by default, so this is a deliberate setting in the reference project, not a given. Exposing the app to other machines would mean revisiting both the bind address and auth.
- **Secure-context note** — `RTCPeerConnection` and `WebSocket` both work from `http://localhost` (localhost is treated as a secure context by browsers), so receiving WebRTC video needs no HTTPS. *(This assumption breaks if the app is ever served to other machines — that would require `wss`/HTTPS and likely auth. Out of scope for v1, noted so the localhost-only assumption is deliberate, not accidental.)*

## Repository Layout

This repo is a **pnpm workspace monorepo** containing the web library, an example app, and a reference TouchDesigner project. The library may be published to npm later, but is developed in-workspace for now.

```
td-web-gui/
├── packages/
│   └── td-core/          # reusable Solid.js library (the deliverable)
├── apps/
│   └── example/          # example Solid app consuming td-core end-to-end
├── td/                   # reference TouchDesigner project (see below)
├── docs/
└── prds/
```

### Toolchain

- **pnpm workspaces** — `td-core` is a workspace package consumed by the example app via the workspace protocol.
- **Vite** — dev server for the example app and library build (lib mode for `td-core`).
- **`td-core` packaging** — `solid-js` is a **`peerDependency`** (never bundled), so the consuming app supplies the single Solid runtime; bundling it would create a second reactive graph and silently break signal reactivity. The library build is **JSX-preserving** (`vite-plugin-solid` lib config, not pre-compiled DOM) and ships an `exports` map with type declarations, matching how Solid libraries are normally consumed.
- **Vitest** — unit tests (connection manager, message parsing, throttle, echo-suppression logic).
- **Integration tests against a mock TD** — the connection manager is exercised over a stub WebSocket server (full `hello`→`welcome`→`snapshot`→`update` flow, reconnect/resync, malformed-message handling) and the WebRTC logic against a faked `RTCPeerConnection`, so the wire contract is covered in CI without a live TouchDesigner. The reference `td/` project remains the manual end-to-end check (especially for real WebRTC media, which can't be meaningfully faked).

### TouchDesigner-side scope

This repo **owns a reference TD project** under `td/` so the web UI is testable end-to-end and others can copy the pattern:

- A minimal `.toe` (and/or `.tox`) with a Web Server DAT, WebRTC DAT, and a Video Stream Out TOP wired up.
- DAT callback scripts (Python) handling parameter get/set and WebRTC signaling, kept as version-controlled text alongside the `.toe`.
- The protocol contract (message shapes) documented so the TD side can be rebuilt independently.

## Package Structure

**`td-core`** — reusable Solid.js library, droppable into any Solid project

- **Typed entry point** — `createTDClient<Schema>()` is the primary API: it returns a **schema-bound bundle** — a typed `Provider`, the control/display components (`TextInput`, `NumberInput`, `Range`, `Video`, …), and the signal helpers (`signal`, `store`, `videoStream`) — all generic over that instance's param map, so parameter `name`s autocomplete and typos are compile errors *inside JSX*. One factory per TD instance (schemas are heterogeneous, see *Type safety*). See [TECH_PROPOSAL.md:131-158](prds/TECH_PROPOSAL.md#L131-L158) for the rationale and shape.
- **Primitives** (reactive signals + connection logic, the single implementation the factory wraps):
  - `createTDConnection<Schema>(url)` — WebSocket connection manager; returns reactive connection **status** signal, typed `signal()` / `store()` / `videoStream()` methods, `send()`, and `reconnect()`. Handles auto-reconnect with exponential backoff and re-syncs parameter state on reconnect. Usable standalone with **zero context** (e.g. non-component code). `createTDClient` and `<Provider>` are thin layers over this — there's one connection implementation, not two.
  - `createTDSignal(name)` — context sugar: binds a Solid signal to a named TD parameter on the **nearest provider's** connection (calls that connection's `.signal()` underneath). Used internally by the factory's components; available directly for custom components.
  - `createTDStore(paramMap)` — batch version for grouped parameters.
  - `createTDVideoStream(config)` — WebRTC setup (signaling multiplexed over the WS connection), returns a `MediaStream` signal. Supports **multiple video tracks per peer connection**, so one instance can expose several streams without opening extra peers. Streams are addressed by an explicit id rather than assuming one-video-per-instance.
- **Components — Controls** (bidirectional, bound to TD parameters) — each is a member of the `createTDClient<Schema>()` bundle, used namespaced (e.g. `<Mixer.Range>`); listed here by bare member name:
  - `<TextInput name="par_name" />` — text input bound to a TD string parameter; sends on change, updates when TD pushes a new value.
  - `<NumberInput name="par_name" />` — numeric input with optional `min`, `max`, `step`; bidirectional sync.
  - `<Range name="par_name" />` — range slider with optional `min`, `max`, `step`; sends continuous values to TD (throttled by default), reflects TD-side changes.
  - `<Toggle name="par_name" />` — checkbox bound to a TD **bool** (Toggle) parameter; sends `true`/`false`, reflects TD-side changes.
  - `<Button name="par_name" mode="pulse|hold|toggle" />` — a button with three modes:
    - **`mode="pulse"`** (default) — fires a TD **pulse** (momentary) parameter. Pulses are **fire-and-forget events, not values**: clicking sends a dedicated `pulse` message rather than an `update`, the component holds no synced state, and it is **web → TD only** (excluded from snapshot/echo logic). One pulse per activation.
    - **`mode="hold"`** — momentary on/off bound to a TD **bool** parameter: sends `true` on press, `false` on release. This is a normal bool `update`, so it's stateful and bidirectional — the button reflects the param's live value (e.g. active styling) and an external TD-side change updates it. Two correctness details so the bool can't get stranded `true`:
        - **Pointer capture for press/release.** On pointerdown the button calls `setPointerCapture`, so `pointerup` is delivered even if the cursor has dragged off the element by release. `pointercancel` and `lostpointercapture` (and a window `blur` while held) are all treated as release → send `false`, covering the "released outside the window / OS stole focus mid-press" cases that a bare `pointerleave` handler misses.
        - **Keyboard accessibility.** Pointer events alone make hold keyboard-inaccessible, so it's also a real `<button>` that responds to Space/Enter keydown → `true` and keyup → `false` (with the browser's key-repeat suppressed so a held key doesn't re-fire `true`). It carries the appropriate pressed-state ARIA so assistive tech sees the momentary state.
    - **`mode="toggle"`** — bound to a TD **bool** parameter; each click flips the value. Same wire path as `<Toggle>` (bool `update`, bidirectional) but rendered as a button — this is the "TD has a toggle, shown as a button in the web UI" case.

    Only `pulse` mode uses the `pulse` message; `hold` and `toggle` are ordinary bool updates, so they participate fully in snapshot/resync and reflect TD-side changes.
  - `<Select name="par_name" options={...} />` — dropdown bound to a TD **Menu** parameter. `options` is a list of `{ value, label }`; the wire value is the menu's string key. Reflects TD-side changes. Options are **authored on the web side** by default, not introspected from TD's menu — consistent with the no-introspection schema stance. If TD's menu keys change, the web `options` must be updated to match; keeping them in sync is the app's responsibility, exactly like the typed param schema.
  - `<Select name="par_name" />` with **no `options`** — the deliberate exception, added in Phase 6.2. Some menus cannot be authored in advance at all: an Audio Device In/Out CHOP's `device` menu has machine-specific keys (`{0.0.1.00000000}.{feb5e51a-…}||Voicemeeter_Out_A4_(VB-Audio…)||1`) paired with readable labels, and the list changes when hardware is plugged in. For these TD announces the options over the [`menus`](#menus) message and the dropdown builds itself. The prop always wins when both exist, so announcing is backwards-compatible for every existing `<Select>`. See § *TD-announced menus*.
  - `<Color name="par_name" />` — color picker bound to a multi-component **array** parameter (`[r, g, b]` or `[r, g, b, a]`, 0–1 floats matching TD's color pars). Sends the array (throttled by default while dragging), reflects TD-side changes; an `alpha` prop toggles RGB vs RGBA.
  - `<Vector name="par_name" />` — a group of numeric inputs bound to a non-color multi-component **array** parameter (XYZ position, UV, size, etc.). A `length` (or `labels`) prop sets the component count; sends the whole array (throttled by default while dragging) and reflects TD-side changes. This is the generic case of the array wire shape — `<Color>` is its color-specialized sibling and `<NumberInput>` the single-component scalar case — so vector pars don't fall through the gap between scalar inputs and the color picker.
- **Components — Display** (read-only, one-directional TD → Web):
  - `<Video stream="..." />` — renders a WebRTC video stream from the provider's instance, selected by stream id (defaults to the instance's primary stream when only one exists). The underlying `<video>` is rendered **`muted autoplay playsinline`**: browsers block un-muted autoplay, so without `muted` the stream silently never starts, and `playsinline` stops iOS Safari forcing fullscreen. v1 is video-only, so muting costs nothing; these attributes are overridable via passthrough props if an app adds audio later (which would then require a user-gesture unmute). **Several `<Video>` may bind the same stream id** — e.g. the same feed shown in a wall tile and a detail/preview pane. They share the one decoded `MediaStream` for that id (the same shared-resource model as multiple components on one param), so a duplicate tile attaches the existing stream rather than negotiating a second track or decoder.
  - `<Value name="par_name" />` — renders the current value of a TD parameter as text (a readout/meter). Subscribes to inbound updates only — never sends. Accepts an optional `format` function for display (e.g. fixed decimals, units). Works for scalars and arrays.
- **Components — Infrastructure**:
  - `<Provider instance="a" url="...">` (the `Provider` member of a `createTDClient<Schema>()` bundle) — context provider that owns **one instance's** connection and shares it with its subtree. Multiple providers (one per TD instance, each from its own factory) can coexist; that factory's control/display components bind to the nearest provider via context.

All control components share a common pattern: they accept a `name` prop (the TD parameter name), use `createTDSignal` internally, and support standard HTML input props for styling/accessibility.

### Styling — headless / unstyled

Components render bare HTML elements with predictable class hooks and pass through all props. `td-core` ships **zero CSS opinion** — each consuming project styles freely. This matches the "droppable into any project" goal.

### Type safety — user-defined typed schema

A consuming project declares a TypeScript map of parameter names → value types and binds it once with `createTDClient<Schema>()`, which returns a **schema-bound bundle** — provider, components, and signal helpers all generic over that map:

```ts
interface MixerParams {
  text1: string
  opacity: number
  speed: number
}

const Mixer = createTDClient<MixerParams>()
// Mixer.Provider, Mixer.TextInput, Mixer.Range, Mixer.Video, Mixer.signal(...) — all typed to MixerParams
```

This gives autocomplete and compile-time name/type checking **inside JSX**, without TD introspection or codegen. The factory exists because TypeScript can't flow a generic from a `<Provider<Schema>>` down into a free-floating `<TextInput>` child — a standalone component's prop types can't depend on which provider sits above it. Binding the schema once into a component bundle is what makes `name` checked where you actually write it.

Because instances are **heterogeneous**, the schema is **per-instance** — one `createTDClient<Schema>()` per TD instance, each typed by its own param map. (Generation from a live TD network is a possible future enhancement, out of scope for v1.)

```tsx
// One factory per instance; each factory's components bind to that factory's own provider.
const Mixer  = createTDClient<MixerParams>()
const Render = createTDClient<RenderParams>()

<Mixer.Provider  instance="mixer"  url="ws://localhost:9980">
  <Mixer.TextInput name="text1" placeholder="Enter message" />   {/* name checked vs MixerParams */}
  <Mixer.Range name="speed" min={0} max={10} />
  <Mixer.Video />
</Mixer.Provider>

<Render.Provider instance="render" url="ws://localhost:9981">
  <Render.NumberInput name="opacity" min={0} max={1} step={0.01} />
  <Render.Video />
</Render.Provider>
```

The underlying `createTDConnection<Schema>(url)` / `createTDSignal(name)` remain public for non-component or advanced use, but the factory is the intended path for app UI.

## Multiple TD Instances

The app connects to several TD instances on the same machine (distinguished by port). Design decisions:

- **Static configuration at startup** — the app declares a known list of instances (`{ id, url }`) up front; connections are established on mount. No runtime discovery/add-remove in v1 (could be layered on later without changing the binding model). The list lives as a **typed config module in the consuming app** (e.g. `apps/example/src/td.config.ts` exporting `{ id, url }[]`), not in `td-core` — the library stays config-agnostic and just receives URLs. Host/port can be overridden via Vite `import.meta.env` for local tweaks, but it's resolved at build/startup, not discovered at runtime.
- **Heterogeneous schemas** — each instance may run a different TD project with its own parameter set, so typing is **per-instance**: one `createTDClient<Schema>()` per instance (over `createTDConnection<Schema>` underneath). Identical-schema rigs are just the trivial case of this.
- **Scoped provider binding** — each instance is wrapped in its own factory's `<Provider instance="..." />`. That factory's control/display components bind implicitly to the nearest provider via Solid context and stay instance-agnostic — no per-component `instance` prop to thread through.
- **Independent connection lifecycles** — each instance has its own WebSocket, WebRTC peer, status signal, throttling, and reconnect/backoff state. One instance dropping or reconnecting does not affect the others.
- **Config `id` is authoritative; `welcome` metadata is advisory** — the app's `{ id, url }` config is what identifies and keys a connection. The optional `id`/`label` in `welcome` is used only for display (e.g. a header label) and diagnostics; if it disagrees with the config `id`, the config wins and the mismatch is debug-logged. `welcome` is never used to re-key or re-route a connection, so a misconfigured TD project can't silently steal another instance's bindings.

## Video at Scale (up to 8 streams)

The app renders **up to 8 video streams simultaneously, all visible at once** (a grid/wall, no hidden/switched views in the common case). Design implications:

- **No fixed stream-to-instance mapping** — the number of streams is independent of the number of instances. Some instances may emit multiple video streams (carried as **multiple tracks on that instance's single peer connection**), others one or none. `<Video stream="..." />` addresses a stream by explicit id rather than by "the instance's video" — the single-stream default (`<Video>` with no `stream`, see [TECH_PROPOSAL.md:123](prds/TECH_PROPOSAL.md#L123)) is just a convenience for the one-stream case, not a 1:1 stream-to-instance assumption.
- **Decode budget is comfortable at target quality** — streams target **≤720p / ≤30fps**, so 8 concurrent hardware-decoded streams are well within a typical machine's budget. Quality is treated as a tunable; this target is a stated performance variable, not a hard limit.
- **Lazy-connect is *not* the primary lever here** — since all streams are visible continuously, every peer/track negotiates and decodes up front. (Lazy/pause-when-hidden remains available in `createTDVideoStream` for apps that *do* hide streams, but isn't the default assumption for this use case.)
- **Reuse peers per instance** — opening one peer connection per instance and multiplexing its video tracks (rather than one peer per stream) keeps connection count and ICE overhead down when an instance serves several streams.

## Behavioral Decisions

### Outbound rate limiting

High-frequency controls (sliders mid-drag) **throttle outbound sends by default** (~60fps, rAF-aligned) to protect the TD socket from message floods. Throttling is configurable per-component (e.g. a prop to change the rate or opt out for low-frequency inputs).

**`pulse` bypasses the throttle and is sent immediately.** A pulse is a discrete event, not a sampled value, so buffering it in a rAF frame would add latency and risk coalescing or dropping distinct presses. Only the continuous `update` path is throttled; `pulse` always fires on the spot.

**Backpressure-aware, not just rate-limited.** The rAF throttle bounds send *frequency*, but not the socket's send buffer. If TD stops draining the socket (a re-cooking DAT, a stalled `.toe`), `ws.bufferedAmount` can grow without bound while controls keep posting at 60fps — and across up to 8 instances that compounds. So the outbound path also **checks `bufferedAmount` against a high-water mark before sending**: while the buffer is above it, `update` sends are skipped (the next frame's coalesced value supersedes them anyway, so dropping is correct — only the latest value matters). A sustained high-water condition flips a per-connection `congested` flag on the status signal (so a UI can indicate it) and, past a longer threshold, is treated like a half-open socket and forces a reconnect. `pulse` is exempt from *coalescing* but still respects the buffer: a pulse fired into a congested socket is dropped and debug-logged rather than queued behind stale data (consistent with *Outbound sends while disconnected are dropped*).

### Invalid / empty numeric input

Numeric controls (`<NumberInput>`, `<Range>`, `<Vector>`, `<Color>`) **never send `NaN`**. While a field is empty or unparseable mid-edit, the component **holds the last valid value in the signal and sends nothing**, so TD keeps showing the last good value rather than receiving garbage. On blur, if the field is still empty/invalid, the input **snaps back** to the signal's current value (standard "revert to last valid"), so the displayed value and TD can't drift apart. When `min`/`max` are set, values are clamped to range before sending.

### Inbound update handling

The params bus is a **broadcast** (every client receives all exposed param updates), so across up to 8 instances at ≤60fps the web can see a steady inbound stream — most of it for params a given client isn't bound to. Kept cheap by:

- **Lazy signal allocation, one signal per name** — a signal exists only for a param name something has actually bound (`createTDSignal` / a component), and **all components binding that name share the one signal** (see *Multiple components per parameter*). The connection's routing table maps name → signal; an inbound update for an unbound name is a **map miss and is dropped** with no allocation and no reactive work. Dispatch cost scales with what the app *uses*, not with everything TD broadcasts. Once allocated, a signal **lives for the connection's lifetime** — the param universe is small and static, so this avoids churn as controls mount/unmount; refcounted teardown is a possible later optimization.
- **Batched application** — each `update` message's whole `params` map is applied inside Solid's `batch()`, so one message causes at most one reactive flush regardless of how many params it carries.
- **No inbound throttle in v1** — fine-grained reactivity means only *changed, bound* signals touch the DOM, and per-instance sockets spread the parse work. If profiling ever shows inbound parse/dispatch as a cost, a coalesce-per-frame step can be added without changing the wire format. (Noted so the "no inbound throttle" choice is deliberate.)

### Text commit modes

`<TextInput>` supports a `commitOn` prop (`'input' | 'enter'`, default `'input'`) controlling when a keystroke reaches the bound signal and the wire.

- **`commitOn="input"`** is the existing send-on-every-keystroke behavior and stays the default, so `apps/example` and prior tests are unregressed.
- **`commitOn="enter"`** (added for `apps/text-selector`, see [TEXT_SELECTOR.md §6](TEXT_SELECTOR.md#6-td-core-changes)) holds keystrokes in a local draft; nothing is sent until commit. Commit fires on the ancestor `<form>`'s native `submit` (`preventDefault()`'d), or an Enter `keydown` fallback when there's no ancestor form (guarded on `event.isComposing` so an IME confirmation doesn't commit), and always on blur. **Escape reverts the draft** to the last committed value and sends nothing; because a commit whose draft equals the last committed value is a no-op, a blur immediately following Escape can't re-send. This relies on focus-based echo suppression (below) — a draft can only exist while focused, so `binding.value()` doubles as "last committed" with no extra signal.

### Multi-line text

`<TextInput multiline>` renders a `<textarea>` and translates line breaks at the wire boundary: the field holds real newlines, the bound signal and TD hold the two-character `\n` escape TouchDesigner string pars use (`escapeNewlines` / `unescapeNewlines`, exported for code that writes such a param through `signal()` directly). Translation is opt-in per component rather than applied to every string param, because `\n` in a param that holds a Windows path is a path, not a line break.

Under `commitOn="enter"`, **Enter commits and Shift+Enter inserts a line break**. A textarea has no implicit form submission, so Enter is handled in `keydown` even inside a `<form>`; the form's `submit` listener stays as a commit path for other submitters.

### Bidirectional echo / edit conflict

When the user is actively editing an input **and** TD pushes a new value for the same parameter, the **local edit wins while the input is focused / being dragged**. Inbound TD updates for that parameter are ignored until blur, then sync resumes. This prevents the value or cursor from jumping out from under the user.

- **Local writes are optimistic** — a control updates its own bound signal **immediately** on user input, before any TD echo, so the UI never waits a round-trip to feel responsive. The focus rule above is what makes this safe: TD's echo of the just-sent value is ignored while the input is focused, and the eventual blur (then live updates, or a reconnect snapshot) reconciles if the two ever diverge. The one exception is `pulse`, which holds no state and so has nothing to update optimistically.

### Multiple components per parameter

Binding several components to the same param name is a **supported feature**, not an accident — e.g. a `<Range>` slider beside a `<Value>` readout, a slider plus a `<NumberInput>` (drag *or* type), or the same control mirrored in a header and a detail panel. It falls out of the shared-signal model:

- **All binders share one signal** (per *Lazy signal allocation*), so a TD update fans out to every bound component and an optimistic local write from one is instantly visible in the others via Solid's reactivity — no extra wiring.
- **Focus-suppression is an active-editor *count*, not a boolean.** The signal tracks how many bound components are actively editing (incremented on focus / drag-start, decremented on blur / drag-end); inbound TD updates are suppressed while the count is `> 0`. A browser focuses one element at a time, so in practice this is 0 or 1 — but the count is the correct generalization (it handles a slider drag overlapping a focused input without special-casing) and keeps everything on a single signal.
- **`min` / `max` / `step` are view-level, not stored.** The shared signal holds the raw value; each component clamps and steps its own display and what it sends. Two controls with different ranges on the same param are just different windows onto one value.

### Connection lifecycle & initial sync

Every connection follows the same handshake on open (and again on each reconnect):

1. Web sends `hello` (with its `protocol` version).
2. TD replies with `welcome` (its `protocol` version, plus optional instance metadata like id/label).
3. Web sends `snapshot-request`.
4. TD replies with `snapshot` (all currently-exposed param values).

The status signal carries this progression — a `synced` flag flips true once the `snapshot` is applied.

- **Pre-snapshot render** — before the snapshot lands, each bound signal is `undefined` (or a per-binding `default`/`placeholder`), and components render their natural empty/default state. Inputs are **not disabled by default** (on localhost the snapshot is effectively instant), but `synced` is exposed so an app *can* gate or skeleton its UI if it wants.
- **No ordering race, by construction** — a single WebSocket delivers in FIFO order, so the `snapshot` (which TD generates *after* receiving `snapshot-request`) already reflects every update TD sent before it, and any update TD sends afterward arrives *after* the snapshot. The web therefore just **applies messages in arrival order** — snapshot as authoritative baseline, then live updates on top — with no buffering or reordering logic.
- **Version handshake policy** — `protocol` is a single integer, bumped only on **breaking** wire changes. On mismatch the web does **not** hard-reject (web and TD reference project are versioned together in this repo, so a mismatch is a deploy mistake, and bricking the UI on a closed system helps no one). Instead it logs a prominent warning and sets a `protocolMismatch` flag on the status signal, then proceeds best-effort. *(Judgment call — easy to switch to hard-reject if a mismatch ever risks silent data corruption.)*
- **Handshake watchdog** — the socket opening (`onopen`) is not the same as TD being ready to talk. If the TD-side callback throws or never replies, the connection can sit in `connecting`/un-`synced` forever — the `ping`/`pong` heartbeat only guards an *already-established* session, not the handshake before it. So a watchdog requires `welcome` **and** `snapshot` to arrive within a short window of `onopen` (default ~5s — effectively instant on localhost); if either is missing, the attempt is abandoned and routed into the normal reconnect/backoff path rather than wedging. The watchdog is cleared the moment `snapshot` is applied (`synced` flips true).

### Connection resilience

On WebSocket drop: **auto-reconnect with exponential backoff**. Connection status is exposed as a signal so UIs can show indicators or disable inputs. On reconnect, **re-sync parameter state** so signals reflect current TD values rather than stale data.

- **Outbound sends while disconnected are dropped, not queued** — if a control writes while the socket is `connecting`/`closed`, the `update`/`pulse` is discarded (debug-logged), not buffered for replay. Buffering would fight the snapshot resync that immediately follows reconnect: replaying a stale slider position only to have the snapshot overwrite it (or vice-versa) is just a race. The snapshot is the authoritative baseline, and a still-focused input re-sends its current value naturally on its next change/commit. (Pulses are momentary events — a pulse fired into a dead socket is simply lost, which is the correct semantics for a missed button press.)
- **Timing constants are configurable with sane defaults** — backoff starts ~500ms and doubles to a ~10s ceiling with jitter; the `disconnected`-grace window before treating a WebRTC peer as dead is ~2s; the app-level `ping` fires ~every 5s and a missing `pong` within ~10s marks the socket half-open and forces a reconnect; the **handshake watchdog** gives `welcome`+`snapshot` ~5s after `onopen` before abandoning the attempt (see *Connection lifecycle & initial sync*). These are per-connection options, not baked into the wire format, so a slower/remote deployment can loosen them without a protocol change.

### WebRTC resilience & connectivity

On localhost the failure modes aren't network glitches — they're **TD-side events** (a `.toe` reload, the WebRTC DAT re-cooking, an instance restart). So resilience here means *detect that a peer died and rebuild it cleanly*, more than riding out a flaky link.

- **No STUN/TURN — host candidates only.** Browser and TD are on the same machine, so ICE only ever needs host candidates (no NAT, no relay). `RTCPeerConnection` is configured with `iceServers: []`, which also makes ICE gathering near-instant when up to 8 peers come up at once. `iceServers` stays a config option so the same lib works if TD ever runs on a different box, but defaults empty. *(Phase 5 correction: this originally said the candidates would be `127.0.0.1`. Observed live, they aren't — Chrome emits an mDNS `.local` name and TD its LAN interface. They pair fine, so the decision holds; only the expected addresses were wrong.)*
- **Failure detection via `connectionState`.** Monitor `pc.connectionState` (with `iceConnectionState` as a fallback for older behavior). Treat `failed` — and `disconnected` after a short grace period — as triggers. A **per-stream status signal** (mirroring the WS connection-status pattern) lets `<Video>` show a "reconnecting" overlay instead of a frozen last frame.
- **Rebuild, don't ICE-restart.** On `failed`, tear down and rebuild the peer from scratch (new `RTCPeerConnection`, re-run signaling) rather than attempting `restartIce()`. The real failure mode is one end going away entirely, where ICE restart can't help anyway. ICE restart can be added later if a genuine transient-drop case appears.
- **Renegotiation is a normal event, not just initial connect.** `createTDVideoStream` handles `onnegotiationneeded` throughout the peer's life: if a TD instance starts/stops a track at runtime, a new offer/answer is exchanged and the `streams` message is **re-sent on every (re)negotiation** so `<Video stream="...">` rebinds to the correct track if `mid`s shift. This is the reason the explicit `id`→`mid` mapping exists rather than assuming a fixed track order.
- **WS-reconnect drives WebRTC recovery.** The WebSocket *is* the signaling channel, but media is its own transport — an established peer keeps flowing video through a brief WS blip. So video is **not** torn down when the WS hiccups. Instead, on WS reconnect, each peer's `connectionState` is checked and only the dead ones are rebuilt; healthy peers are left untouched. This reuses the existing reconnect hook that already re-syncs parameter state.
- **Deferred renegotiation across a WS gap.** Renegotiation *needs* the signaling channel, so an `onnegotiationneeded` (or a TD-side track add/remove, or an inbound offer) that occurs while the WS is down can't complete. Each peer therefore keeps a **`negotiationPending` flag**: if negotiation is requested with no live socket, it's recorded rather than dropped, and the same WS-reconnect hook that rebuilds dead peers also **flushes pending negotiation on the still-alive ones** — re-running the offer/answer (and re-sending the `streams` map) so a track that appeared during the blip binds correctly. This closes the gap between "media survives a WS blip" and "tracks can change at any time."

### Provider teardown & resource cleanup

A `<Provider>` owns disposable, non-GC-able resources, so unmounting one (the app navigating away, or a hot-reload in dev) must release them via Solid's `onCleanup` — otherwise sockets, timers, and video decoders leak, which compounds fast at up to 8 instances:

- **Close the WebSocket** and cancel any pending reconnect/backoff timer **and** the `ping` interval, so a torn-down provider can never resurrect itself with a stray reconnect.
- **Close the `RTCPeerConnection`** and call `stop()` on every received track / `MediaStream`, so the browser frees the hardware decoder rather than holding it on a detached `<video>`.
- **Drop the routing table and per-param signals** for that connection.

Each provider tears down only its own instance; sibling providers are untouched, mirroring the independent-lifecycle rule. `createTDConnection` / `createTDVideoStream` register their own `onCleanup` so cleanup is automatic when used inside a component tree, not something each consuming app must remember to wire up.

### Error & malformed-message handling

- **`error` messages are surfaced, not fatal** — an inbound `error` (e.g. `unknown_param`) is routed to an errors signal / `onError` callback on the connection and **console-logged by default**. It does **not** auto-disable inputs or drop the connection (the cause is usually a single bad param, often transient). Apps can subscribe to show a toast/indicator. `ref` is **optional**: a param-scoped error (`unknown_param`, `param_not_writable`) carries the `ref` so handlers can do per-param recovery (mark read-only, re-snapshot — see *Parameter modes*), while a connection-scoped error (no `ref`) is surfaced the same way but triggers **no per-param action** — there's nothing to revert. Recovery code keys on `ref` being present (`if (err.ref) { … }`), so a `ref`-less error is logged/surfaced and otherwise inert rather than misattributed to some param.
- **Unknown message `type`s are ignored** — the web silently drops (debug-logs) any message whose `type` it doesn't recognize, so TD can add new message types without breaking older clients (forward-compat).
- **Malformed JSON is caught, dropped, and logged** — a parse failure never tears down the socket; the connection stays up and processing continues with the next message.
- **Unknown params in an `update` are ignored** — consistent with the broadcast-bus model, the web simply skips param names it isn't bound to (a routing-table miss), no error raised.

## Key Patterns

- **Signals** for reactive TD parameter state (`createSignal` per parameter or `createStore` for grouped state).
- **WebSocket service** — singleton connection manager that parses incoming messages, routes WebRTC signaling, and writes parameter updates to signals.
- **WebRTC service** — handles signaling over the shared WebSocket and attaches the `MediaStream` to a `<video>` element.

## WebSocket Wire Format

A **typed JSON discriminated-union envelope**: every message is a JSON object with a `type` field and a type-specific payload. JSON parses natively in the browser and via `json.loads` in the TD-side Web Server DAT. Rejected alternatives: a minimal `{name, value}` format (can't carry signaling/resync/errors without ugly overloading) and an OSC-style `{addr, args}` format (loose positional typing, nested payloads don't fit an args list, and the TD side is a Web Server DAT doing JSON anyway — not an OSC DAT).

### Design decisions

- **Readable keys** (`type`, `params`, `name`, `value`) over terse ones — payloads are small and ≤60fps; debuggability wins.
- **One `update` message for single and batch** — it always carries a `params` map; a single change is a one-entry map. The outbound throttle coalesces multiple param changes in a frame into one message for free, and the shape is symmetric in both directions. Values may be scalar (number/string/bool) or an array (multi-component pars like color/XYZ). This covers toggles (bool), menus (string key), and color (array) without new message types — only the components differ.
- **Pulses are a separate `pulse` message, not an `update`** — a momentary parameter has no persisted value to sync, so modeling it as an `update` would be wrong (nothing to put in a snapshot, nothing to echo). `{ "type": "pulse", "name": "reset" }` is an explicit **web → TD only** event: the TD side calls `.pulse()` on the mapped par. Pulses are excluded from snapshots and from the focus/echo rules since they carry no state. A button bound to a TD *toggle* is a different thing — it's a stateful **bool** that rides the normal `update` path bidirectionally (`<Button mode="hold|toggle">`), not a pulse.
- **Friendly names on the wire, op/par mapping on the TD side** — the wire carries `opacity`, not `/project1/level1/opacity`. The reference TD project holds a registry mapping friendly name → **(operator, parameter-or-ParGroup, wire-type)**. This decouples the UI from TD's node layout (ops can move/rename without breaking the UI), matches the TypeScript schema names, and is the single place type coercion lives (see *Value types & TD-side coercion*).
- **Params are a shared broadcast bus, not a web-private channel** — the web UI is *not* assumed to be the only consumer; TD instances may exchange the same params among themselves. So TD **broadcasts all exposed param updates to all connected clients**; there is no per-client subscription/filtering. The web simply ignores params it isn't bound to.
- **Versioned handshake** — the web opens with `hello` (its `protocol` int); TD replies with `welcome` (its `protocol`, plus optional instance metadata). `protocol` bumps only on breaking changes; on mismatch the web warns and proceeds rather than rejecting (see *Connection lifecycle & initial sync*). The `welcome` also serves as a definitive "TD is alive and speaking" signal for the status flag.
- **Resync via snapshot** — on connect/reconnect the web sends `snapshot-request`; TD replies with a `snapshot` of all currently-exposed param values, so signals aren't stale after a reconnect. Per-connection FIFO ordering makes the snapshot an authoritative baseline with no client-side reordering needed.
- **No echo tagging needed** — because local edits win while an input is focused, TD echoing a value the web just set is harmless (the focused input ignores inbound updates). No per-message origin/timestamp fields.
- **Stream announcement** — one peer per instance can carry several video tracks; a `streams` message maps each track (`mid`) to a stream `id` so `<Video stream="x">` can select the right track.
- **ICE candidates carry their full descriptor** — `rtc-ice` sends `{ candidate, sdpMid, sdpMLineIndex }`, the exact fields `RTCPeerConnection.addIceCandidate()` needs, not just the bare candidate string (a string alone can't be applied without its m-line association). **End-of-candidates** is signaled by an `rtc-ice` whose `candidate` is `null` — the browser's end-of-gathering event — which the receiver forwards as `addIceCandidate(null)`. This keeps trickle-ICE symmetric in both directions and independent of which side offers (the open question below). With `iceServers: []` on localhost, gathering is a quick handful of host candidates, so this exchange is short.
- **App-level `ping`/`pong`** — browser JS can't observe WS ping/pong frames, so an optional app-level heartbeat detects half-open sockets, paired with the status signal and reconnect/backoff.

### Value types & TD-side coercion

The wire speaks only **clean JSON types** — `bool`, `number`, `string`, `number[]` — and **TD does all type coercion**, because that's where parameter-type information already lives (the registry). The web never has to know that a TD Toggle is really a `0`/`1` float or that a color is several parameters; its TypeScript schema (`boolean` / `number` / `string` / `number[]`) lines up 1:1 with the wire. (The rejected alternative — TD sends raw values and the web coerces — would duplicate TD's type info on the web and make the TS schema lie about what's on the wire.)

Each registry entry declares a **wire-type**, and the DAT callback coerces in both directions:

| Wire type | TD → web (read) | web → TD (write) |
|---|---|---|
| `bool` | `bool(par.eval())` | `par.val = v` (TD accepts bool → 0/1) |
| `number` | `par.eval()` (int or float) | `par.val = v` |
| `string` | `par.eval()` | `par.val = v` |
| `number[]` | `[p.eval() for p in pargroup]` | set each component in order |

Two specifics this pins down:

- **Menus carry the string key, not the index.** `par.eval()` on a Menu par returns the key (matching `<Select>`'s `value`); keys survive menu reordering where indices wouldn't.
- **Arrays map to a TD ParGroup**, not a single par. A color/XYZ value is several component pars (`colorr`/`colorg`/`colorb`, `tx`/`ty`/`tz`), so the registry entry for an array param references the ParGroup with a **fixed component order** — that order *is* the array order on the wire. This is what lets `<Color>` / `<Vector>` treat the value as one `number[]`.
- **Int vs float is TD's job, not the wire's** — fits the existing "TD does all coercion" rule, no new mechanism. JSON has one numeric type, so `number` covers both; the registry already knows whether the backing par is int or float, and `par.val = v` lets TD round/truncate on write while `par.eval()` returns the par's native int/float on read. The web's TS schema stays `number` and never has to model the distinction — same stance as bool-as-0/1 in the row above.

### Parameter modes (expression / export / bind)

A TD parameter has a **mode** — `CONSTANT`, `EXPRESSION`, `EXPORT` (CHOP-driven), or `BIND` — and the mode determines whether a write actually takes. This matters because the wire format hides it: the web only ever sees clean JSON values, never the mode.

- **Reads are mode-agnostic — no special handling.** `par.eval()` returns the evaluated result for *every* mode, so snapshots, `update` broadcasts, and read-only displays (`<Value>`, and the display side of any control) reflect the correct live value of an expression/exported/bound par with zero extra logic. The read column of the coercion table already covers this.
- **Writes only belong in `CONSTANT` mode — and an unguarded one is destructive, not inert.** This bullet originally assumed `par.val = v` on an expression/export par would quietly no-op, leaving the user with an edit that reverts for no visible reason. **Measured against 2025.33070 in Phase 6.2, it is worse than that:** assigning `par.val` *flips the par into `CONSTANT` mode*, and the expression stops driving it permanently. The expression text survives in `par.expr`, but nothing evaluates it any more, and TD raises no Python error. So a single web write to an expression-driven par silently detaches a TD author's work, and the damage outlives the browser session that caused it. That makes the mode guard below a data-safety measure rather than a UX nicety. (`BIND` is the one nuance: a two-way bind was measured to *propagate* the write to its master rather than break, so it isn't uniformly read-only the way `EXPRESSION`/`EXPORT` are — but it can't be assumed writable either, and the guard refuses it with the rest.)

Two complementary mechanisms keep this from being a silent failure — a **static** preventive layer and a **runtime** safety net:

1. **Static read-only declaration on the web side (preventive).** The set of non-writable params is **authored in the web schema**, right alongside the typed param map — *not* sent over the wire. `createTDSignal` / `Provider` consult it so a control bound to a read-only name renders as a disabled control (or the app authors it as `<Value>` outright), and in dev a control bound to a read-only param warns. Because it's a web-side authoring decision, there is **no wire-format change** — `snapshot` and `update` stay flat `{name: value}` maps and keep their symmetry ([TECH_PROPOSAL.md:275](prds/TECH_PROPOSAL.md#L275)). This is the same "the web authors its schema, no TD introspection" stance already used for wire-types and `<Select>` menu options ([TECH_PROPOSAL.md:129-144](prds/TECH_PROPOSAL.md#L129-L144)); the cost is the same accepted duplication — the registry and the web schema must be kept in sync. The TD registry still carries a `writable` flag so the write callback (below) is self-contained, but that flag is **not** transmitted.

   ```ts
   // apps/example/src/td.config.ts — read-only set authored beside the schema
   interface MixerParams { opacity: number; text1: string; fps: number }
   const readonly = ["fps"] as const satisfies readonly (keyof MixerParams)[]  // fps is expression-driven in TD

   const Mixer = createTDClient<MixerParams>()

   <Mixer.Provider instance="mixer" url="ws://localhost:9980" readonly={readonly}>
     <Mixer.Range name="opacity" min={0} max={1} />
     <Mixer.Value name="fps" format={n => `${n.toFixed(1)} fps`} />   {/* authored as a readout */}
   </Mixer.Provider>
   ```

2. **Runtime mode check on write, with an explicit error (safety net).** The static set can't see a par whose mode changes *after* startup (constant → expression at runtime), and an app may simply forget to list one. So the write callback *also* checks `par.mode` before assigning and, if it isn't `CONSTANT`, **skips the write and emits an `error`** (`code: "param_not_writable"`) over the existing error channel ([TECH_PROPOSAL.md:257](prds/TECH_PROPOSAL.md#L257)). The web's `onError` handler marks the param read-only reactively and reverts the optimistic local edit — turning a silent revert into a visible, self-correcting signal. For array/ParGroup params the check is per-component, so a partially-bound group (`tx` constant, `ty` expression) reports rather than half-applying.

   ```ts
   // web side — the error makes the runtime case self-correcting
   onError(err => {
     if (err.code === "param_not_writable" && err.ref) {
       markReadonly(err.ref)   // disable the control from here on
       resnapshot(err.ref)     // revert the optimistic edit to TD's real value
     }
   })
   ```

The static layer (1) makes the common, known case — an expression-driven readout authored as `<Value>` — never even produce an error; the runtime layer (2) catches what (1) can't see. If TD ever needs to drive *more* metadata to the web (`min`/`max`/`label`/units), the escape hatch is a dedicated message alongside the snapshot — a deliberate move toward introspection, and explicitly not folded into `snapshot`. **Phase 6.2 opened exactly that hatch, once, for menu options** (see § *TD-announced menus*); the same shape is what any future metadata would use.

### TD-announced menus

The no-introspection stance holds everywhere the web *can* author what it needs. Menu options are the one place it sometimes can't, so `menus` is a deliberate, bounded exception rather than a softening of the rule.

The motivating case is an audio-device dropdown. An Audio Device In CHOP's `device` menu, read off a real machine:

```
key:   {0.0.1.00000000}.{feb5e51a-d9cd-45c0-8aff-4770ba283ba0}||Voicemeeter_Out_A4_(VB-Audio_Voicemeeter_VAIO)||1
label: Voicemeeter Out A4 (VB-Audio Voicemeeter VAIO)
```

Nothing about that is authorable ahead of time: the keys are machine-specific, and the list changes when hardware is plugged in. The usual "keep the web `options` in sync with TD's menu" bargain isn't merely tedious here, it's impossible — which is the test for whether a menu belongs in this exception.

```jsonc
// TD → web, sent before `snapshot` on every snapshot-request, and again whenever the list changes
{ "type": "menus", "menus": { "audiodevice": [ { "value": "default", "label": "default" }, … ] } }
```

Design points, each of which is load-bearing:

- **A separate message, not part of `snapshot`.** `snapshot` stays a flat `{name: value}` map in both directions, and a changed device list can be re-announced on its own without resending every value.
- **Sent before the snapshot**, so a `<Select>` never briefly holds a value with no option matching it.
- **The web-authored `options` prop always wins.** Adding announcements to a project cannot change what an existing `<Select>` renders.
- **Re-announcing replaces the list wholesale.** A merge would leave an unplugged device selectable forever.
- **No registry flag drives it.** TD announces any menu-backed `string` param, because a par either has `menuNames` or it doesn't and asking TD beats asking an author to remember. `bool` params are excluded even though TD Toggles also carry `menuNames` (`['off','on']`) — they travel the wire as bools and render as checkboxes.
- **The value/label split is required, not cosmetic** — a device dropdown showing raw GUIDs would be unusable.

#### Refreshing a stale menu

Menu *contents* changing has **no TD callback**. A Parameter Execute DAT fires on a par's value, mode, enable and export; plugging in an audio interface changes none of those — the value is untouched and only the set of legal values grows. There is nothing to subscribe to, so something has to look again.

This is a known TouchDesigner bug, not an oversight in our design. Derivative logged it in April 2021 ([forum thread](https://forum.derivative.ca/t/breaking-binding-a-dropdown-menu-out-to-a-perform-ui/13123), where staff confirm "the menuNames and menuLabels members are changing so they should be dependable"), and **it is still open on 2025.33070** — measured directly: a Parameter DAT with Menu Names/Labels output, watched by a DAT Execute, fires `onTableChange` **zero** times when `menuNames` changes and **once** when the same par's *value* changes. So that route — the obvious one, and the one the forum poster tried — does not work; don't spend an afternoon rediscovering it. (The DAT's content *is* fresh whenever pulled; what never arrives is the nudge to pull.)

Three ways to look again, best first:

0. **The pulse that causes the change**, when the menu is rebuilt by a TD action rather than by the OS — a Screen Grab TOP's *Refresh Sources*, say. Hook that pulse (`onPulse`) and re-announce: a real event, no poll and no button. Audio devices don't qualify, since the OS changes that list rather than a par.

Otherwise: two mechanisms, and the wire supports both:

1. **`menus-request` (web → TD)** — the default, and what `apps/example` uses. A "Reload devices" button beside the dropdown calls `connection.requestMenus()`; TD re-reads and answers with `menus`. The person who just plugged the device in is right there, so asking on demand is both cheaper and more predictable than guessing. Deliberately separate from `snapshot-request`: refreshing a device list shouldn't drag every parameter value along with it.
2. **A TD-side poll** — for menus that must refresh with nobody watching. `broadcast_menus_if_changed()` diffs against the last announced map and broadcasts only on a real change; wire it to an Execute DAT's `onFrameStart` gated to every second or two. **Not wired up by default**, since it costs a `menuNames` read per registered menu par per tick, forever, for something most projects never need.

Both funnel through the same diffing helper, which is what makes either safe to call freely: an unchanged list sends nothing, so no client is woken for a no-op. On a *real* change the result is broadcast to **every** client rather than only the requester — a device that appeared is news for every open browser, not just the one whose button was clicked.

Registry entry shape (TD side, conceptual):

```python
# friendly name -> registry entry
REGISTRY = {
    "opacity":  { "op": "/project1/level1", "par": "opacity",  "type": "number",   "writable": True  },
    "text1":    { "op": "/project1/text",   "par": "text",     "type": "string",   "writable": True  },
    "fps":      { "op": "/project1/info",   "par": "fps",      "type": "number",   "writable": False }, # expression-driven readout
    "color":    { "op": "/project1/ramp",   "par": "colorr",   "type": "number[]", "writable": True  }, # ParGroup: colorr/g/b/a
}
```

DAT-side write, mode-guarded:

```python
def write_param(name, value):
    entry = REGISTRY.get(name)
    if entry is None:
        send_error("unknown_param", "no param '%s'" % name, ref=name)
        return

    pars = op(entry["op"]).pars(entry["par"] + "*") if entry["type"] == "number[]" \
        else [op(entry["op"]).par[entry["par"]]]

    # refuse if author marked it read-only, or any backing par isn't a settable constant
    if not entry.get("writable", True) or any(p.mode != ParMode.CONSTANT for p in pars):
        send_error("param_not_writable", "param '%s' is not web-writable" % name, ref=name)
        return

    if entry["type"] == "number[]":
        for p, v in zip(pars, value):   # fixed component order == wire array order
            p.val = v
    else:
        pars[0].val = value
```

This adds **one error code** to the catalog (`param_not_writable`) and **no change to the wire format** — the read-only set is authored on the web side, and the registry's `writable` flag stays TD-internal. The error is forward-compatible with *Error & malformed-message handling* (errors are surfaced, not fatal).

### Message catalog (strawman)

```jsonc
// web → TD
{ "type": "hello", "protocol": 1 }                 // version handshake
{ "type": "snapshot-request" }                     // request current state (on connect/reconnect)
{ "type": "menus-request" }                        // re-read TD's menus; answered with `menus` (the "reload devices" action)
{ "type": "update", "params": { "opacity": 0.5, "color": [1, 0, 0, 1], "blendmode": "add", "enabled": true } }
{ "type": "pulse",  "name": "reset" }              // momentary param: TD calls par.pulse()
{ "type": "rtc-offer",  "sdp": "..." }             // offerer role TBD (see below)
{ "type": "rtc-answer", "sdp": "..." }
{ "type": "rtc-ice",    "candidate": "candidate:...", "sdpMid": "0", "sdpMLineIndex": 0 }  // candidate:null = end-of-candidates
{ "type": "ping" }

// TD → web
{ "type": "welcome", "protocol": 1, "instance": "render" }   // reply to hello; optional metadata
{ "type": "snapshot", "params": { "opacity": 0.3, "text1": "hi", "speed": 2 } }
{ "type": "update",   "params": { "speed": 4 } }   // broadcast to all connected clients
{ "type": "streams",  "streams": [ { "id": "main", "mid": "0", "label": "Render A" } ] }
{ "type": "menus",    "menus": { "audiodevice": [ { "value": "default", "label": "default" } ] } }  // options for menus the web can't author; see § TD-announced menus
{ "type": "rtc-offer",  "sdp": "..." }
{ "type": "rtc-answer", "sdp": "..." }
{ "type": "rtc-ice",    "candidate": "candidate:...", "sdpMid": "0", "sdpMLineIndex": 0 }  // candidate:null = end-of-candidates
{ "type": "error", "code": "unknown_param", "message": "no param 'foo'", "ref": "foo" }
{ "type": "error", "code": "param_not_writable", "message": "param 'fps' is not web-writable", "ref": "fps" }  // expression/export/bind par, or registry writable:false
{ "type": "error", "code": "param_type_mismatch", "message": "param 'color' expects 4 components, got 3", "ref": "color" }  // value doesn't fit the entry's wire type: wrong JSON type, wrong array length, unknown menu key
{ "type": "pong" }
```

## Open Design Questions

- **WebRTC offer role** — ~~whether the browser or TouchDesigner sends the initial SDP offer is left open until the reference TD project is wired up and we see what the WebRTC DAT expects.~~ **Resolved in Phase 5: the browser offers**, on initial connect and on rebuild alike, using `recvonly` video transceivers. Only the browser knows when it wants a peer, so browser-offers keeps the connect and rebuild paths identical without adding a "please offer" message. TD still offers for its own renegotiations (only an offerer can add m-lines, so a TD-side track change has to originate there), which the catalog already allows since both `rtc-offer` and `rtc-answer` appear in each direction. See prds/TASKS.md § "Open question resolved during Phase 5".
