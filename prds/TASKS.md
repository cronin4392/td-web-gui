# Implementation Tasks: TD Web GUI

Bite-sized tasks derived from [TECH_PROPOSAL.md](TECH_PROPOSAL.md), ordered **vertical-slice-first**: build the thinnest end-to-end path, then deepen it. Each task is scoped for a single focused session.

## How to use this doc

- Work tasks in order within a phase unless a task notes it's independent.
- **Hard dependency: Phase 1 → Phase 2 → {Phase 3, 4, 5}.** Within Phases 3/4/5 most tasks are independent and parallelizable.
- Every task lands its own Vitest coverage where testable. The proposal explicitly wants the connection manager, message parsing, throttle, and echo-suppression logic unit-tested.
- The wire contract is exercised against a **mock TD WebSocket server** (Phase 2.6), not a live `.toe`. The reference `td/` project (Phase 6) is the manual end-to-end check.
- `td-core` ships **zero CSS** and `solid-js` is a `peerDependency` — never bundle Solid.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 1 — Project scaffolding (no business logic)

- [x] **1.1 — Init pnpm workspace.** Root `package.json`, `pnpm-workspace.yaml` (globs `packages/*`, `apps/*`), `.gitignore`, shared base `tsconfig.json`. No application code.
  - *Done when:* `pnpm install` succeeds on the empty workspace.
- [x] **1.2 — Scaffold `packages/td-core` as a Solid library.** Vite lib mode + `vite-plugin-solid` (JSX-preserving, **not** pre-compiled DOM), `solid-js` as a `peerDependency`, `exports` map with type declarations, package `tsconfig`. Export one trivial symbol.
  - *Done when:* `pnpm --filter td-core build` emits JSX-preserving output + `.d.ts`.
  - *Note:* the build uses `tsc` with `jsx: "preserve"` rather than Vite lib mode — `vite-plugin-solid` always pre-compiles JSX to DOM calls (which this task forbids) and Vite's rollup bundler can't emit JSX-preserved output, so `tsc` is what actually delivers JSX-preserving `.jsx` + `.d.ts` with `solid-js` external. `vite-plugin-solid` still powers the example app and Vitest.
- [x] **1.3 — Scaffold `apps/example` Solid app.** Vite + Solid, depends on `td-core` via `workspace:*`, renders the trivial `td-core` export.
  - *Done when:* `pnpm --filter example dev` shows the symbol in-browser.
- [x] **1.4 — Vitest in `td-core`.** Config + one passing trivial test.
  - *Done when:* `pnpm --filter td-core test` is green.

---

## Phase 2 — Vertical slice: text & numbers over WebSocket

Minimal end-to-end. **No** reconnect, throttle, backpressure, watchdog, or heartbeat yet — those are Phase 3.

- [x] **2.1 — Wire-format types.** TS discriminated-union envelope for the *subset only*: `hello`, `welcome`, `snapshot-request`, `snapshot`, `update`. Include a `parse(raw): Message | null` that try/catches bad JSON and drops unknown `type`s.
- [x] **2.2 — `createTDConnection(url)` core.** Open WS; run handshake (`hello` → await `welcome` → `snapshot-request` → apply `snapshot`); apply inbound `update`; `send()`; reactive `status` signal (e.g. `connecting`/`open`/`synced`). **Lazy signal allocation:** `signal(name)` creates-or-returns one signal per name; routing table maps name→signal; inbound updates for unbound names are dropped (map miss, no allocation). Usable standalone with zero context.
- [x] **2.3 — Factory + context.** `createTDClient<Schema>()` returns a schema-bound bundle (`{ Provider, signal, ... }`). `<Provider url>` owns one connection and shares it via Solid context. `createTDSignal(name)` binds to the nearest provider's connection.
- [x] **2.4 — `TextInput`, `NumberInput`, `RangeInput`, `Value`.** Bound via `createTDSignal`; optimistic local write + send-on-change. `NumberInput`: hold-last-valid while empty/unparseable, snap-back on blur, clamp to `min`/`max` before sending, never send `NaN`. `RangeInput`: slider bound to a number param; value always in-range so no empty/`NaN`/clamp handling. `Value`: read-only, never sends, optional `format` fn, works for scalars and arrays.
- [x] **2.5 — Focus-based echo suppression.** Track an active-editor **count** on the signal (increment on focus/drag-start, decrement on blur/drag-end); suppress inbound TD updates while count `> 0`. Local edit wins while focused.
- [x] **2.6 — Mock TD WS server + integration test.** Stub WebSocket server doing `welcome` → `snapshot` → `update`; test the full `hello`→`welcome`→`snapshot`→`update` flow plus a malformed-message case.
- [x] **2.7 — Example wiring.** `apps/example/src/td.config.ts` exporting `{ id, url }[]` (host/port overridable via `import.meta.env`), plus a page with a text + number control bound through a provider.
  - *Phase done when:* the example round-trips a string and a number against the mock (or a hand-run TD).

---

## Phase 3 — WebSocket hardening

All tasks are per-connection options with sane defaults, not wire-format changes. Mostly independent of each other.

- [ ] **3.1 — Reconnect + exponential backoff.** ~500ms start, double to ~10s ceiling, with jitter. Re-run the full handshake + snapshot resync on each reconnect.
- [ ] **3.2 — Handshake watchdog.** Require `welcome` **and** `snapshot` within ~5s of `onopen`; otherwise abandon the attempt → backoff. Cleared the moment `snapshot` applies (`synced` flips true).
- [ ] **3.3 — `ping`/`pong` heartbeat.** App-level `ping` ~every 5s; a missing `pong` within ~10s marks the socket half-open → forces reconnect. (Guards an *established* session only — the watchdog covers the pre-handshake window.)
- [ ] **3.4 — Outbound throttle.** rAF-aligned (~60fps) coalescing of `update` sends (multiple param changes in a frame → one message). Per-component rate/opt-out prop.
- [ ] **3.5 — Backpressure.** Check `ws.bufferedAmount` against a high-water mark before sending; skip `update`s while above it (latest coalesced value supersedes). Flip a `congested` flag on the status signal; sustained high-water → forced reconnect.
- [ ] **3.6 — Disconnected sends + error handling.** Drop (debug-log) `update`/`pulse` written while `connecting`/`closed` — do **not** queue. Route inbound `error` messages to an errors signal / `onError` (console-log by default, non-fatal). Ignore unknown message `type`s; catch + drop malformed JSON without tearing down the socket.
- [ ] **3.7 — Provider teardown.** `onCleanup`: close WS, cancel reconnect/backoff timer **and** ping interval, drop routing table + per-param signals. Each provider tears down only its own instance.

---

## Phase 4 — Remaining controls + parameter modes

Each control accepts a `name` prop, uses `createTDSignal`, passes through HTML props, and is a member of the `createTDClient<Schema>()` bundle. Mostly independent.

- [ ] **4.1 — `Range`.** Slider with optional `min`/`max`/`step`; sends continuous values (throttled by default); reflects TD-side changes.
- [ ] **4.2 — `Toggle`.** Checkbox bound to a TD bool; sends `true`/`false`; bidirectional.
- [ ] **4.3 — `pulse` message + `Button mode="pulse"` (default).** Add `{ type: "pulse", name }` to the wire types. Fire-and-forget, web→TD only, holds no state, **throttle-exempt** (sent immediately, but still respects backpressure — dropped + debug-logged into a congested socket). Excluded from snapshot/echo logic.
- [ ] **4.4 — `Button mode="hold"`.** Momentary bool: `true` on press, `false` on release. Pointer capture on pointerdown; `pointerup`/`pointercancel`/`lostpointercapture`/window `blur` all → release. Keyboard Space/Enter (keydown→`true`, keyup→`false`, suppress key-repeat). Pressed-state ARIA. Normal bidirectional bool `update`.
- [ ] **4.5 — `Button mode="toggle"`.** Each click flips a TD bool; same wire path as `Toggle`, rendered as a button.
- [ ] **4.6 — `Select`.** Dropdown bound to a TD Menu par; `options` is web-authored `{ value, label }[]`; wire value is the menu string **key**; reflects TD-side changes.
- [ ] **4.7 — `Vector`.** Group of numeric inputs bound to a non-color multi-component `number[]` ParGroup; `length` (or `labels`) prop sets component count; sends whole array (throttled while dragging); reflects TD. This is the generic array wire shape.
- [ ] **4.8 — `Color`.** Color-specialized sibling of `Vector` bound to a `[r,g,b]`/`[r,g,b,a]` array (0–1 floats); `alpha` prop toggles RGB vs RGBA; throttled while dragging.
- [ ] **4.9 — Multiple components per parameter.** Verify the shared-signal model: all binders of a name share one signal, optimistic writes fan out, focus-suppression count handles overlapping editors. Likely already satisfied by 2.5 — add explicit tests (slider + readout, slider + number input).
- [ ] **4.10 — Read-only / parameter modes.** Web-side `readonly` set authored beside the schema → bound control renders disabled + dev warn. Handle inbound `param_not_writable` error → `markReadonly(ref)` + re-snapshot to revert the optimistic edit. No wire-format change.

---

## Phase 5 — Video (WebRTC)

Signaling is multiplexed over the **same** WebSocket. `iceServers: []` (host candidates only on localhost). Tested against a faked `RTCPeerConnection`; real media is a manual check in Phase 6.

- [ ] **5.1 — Extend wire types** for `rtc-offer`, `rtc-answer`, `rtc-ice`, `streams` (both directions).
- [ ] **5.2 — `createTDVideoStream(config)` core.** `RTCPeerConnection({ iceServers: [] })`; signaling over the WS; trickle ICE both ways including `candidate: null` end-of-candidates → `addIceCandidate(null)`; returns a `MediaStream` signal. **Resolve the open offer-role question** (browser vs TD offers) against the real WebRTC DAT — whichever offers on connect also offers on rebuild.
- [ ] **5.3 — `streams` mapping.** Map each track `mid` → stream `id`; support multiple tracks per peer; re-send the `streams` map on **every** (re)negotiation so `<Video>` rebinds if `mid`s shift.
- [ ] **5.4 — `<Video stream="...">`.** Renders the selected stream (defaults to the primary when only one exists); underlying `<video>` is `muted autoplay playsinline` with prop passthrough. Several `<Video>` on one stream id share the one decoded `MediaStream`.
- [ ] **5.5 — Per-stream status + rebuild-on-fail.** Monitor `connectionState` (fallback `iceConnectionState`); `failed` — and `disconnected` after ~2s grace — trigger a full **rebuild** (new `RTCPeerConnection` + re-signal), not `restartIce()`. Per-stream status signal drives a "reconnecting" overlay.
- [ ] **5.6 — Renegotiation + WS-reconnect recovery.** Handle `onnegotiationneeded` throughout the peer's life. Media is **not** torn down on a WS blip — on WS reconnect, check each peer's `connectionState` and rebuild only dead ones. `negotiationPending` flag records negotiation requested while the WS is down; flush it on reconnect.
- [ ] **5.7 — Faked `RTCPeerConnection` tests** for signaling + rebuild paths.
- [ ] **5.8 — Video peer cleanup.** Provider teardown closes the `RTCPeerConnection` and calls `stop()` on every received track / `MediaStream` so the hardware decoder is freed.

---

## Phase 6 — TD reference project + integration examples

Reference TouchDesigner project under `td/`, plus the end-to-end example app pieces. Python/TD callbacks kept as version-controlled text beside the `.toe`.

- [ ] **6.1 — Registry module.** Python `friendly name → { op, par, type, writable }` map. `type` ∈ `bool`/`number`/`string`/`number[]`.
- [ ] **6.2 — Read/write DAT callbacks.** Coercion both directions per the wire-type table (menus carry the string key; arrays map to a fixed-order ParGroup). Mode-guard on write: skip + emit `param_not_writable` if any backing par isn't `CONSTANT`; per-component check for arrays.
- [ ] **6.3 — Handshake/snapshot/broadcast callbacks.** `hello`→`welcome` (with `protocol` + optional instance metadata), `snapshot-request`→`snapshot` (all exposed params), `update` broadcast to all clients, `ping`→`pong`.
- [ ] **6.4 — WebRTC signaling callback.** WebRTC DAT + Video Stream Out TOP wired; SDP/ICE relayed over the Web Server DAT's WebSocket; `streams` announce.
- [ ] **6.5 — Minimal `.toe`/`.tox`.** Everything wired together; Web Server DAT bound to **`127.0.0.1`** (deliberate loopback bind — the closed-system guarantee).
- [ ] **6.6 — Multi-instance example.** 2+ factories/providers with heterogeneous schemas on distinct ports; independent connection lifecycles.
- [ ] **6.7 — Video-at-scale grid.** Up to 8 `<Video>` tiles visible at once, ≤720p/≤30fps target; peers reused per instance.
- [ ] **6.8 — Manual end-to-end checklist** doc covering the live-TD checks that can't be faked (real WebRTC media, reconnect on `.toe` reload).

---

## Open question to resolve during Phase 5

**WebRTC offer role** — whether the browser or TouchDesigner sends the initial SDP offer is left open until the reference TD project is wired up and we see what the WebRTC DAT expects. The catalog includes both `rtc-offer` and `rtc-answer` in each direction so either role works without a format change. Whichever side offers on initial connect must also offer on **rebuild** and renegotiation — resolve all three together.
