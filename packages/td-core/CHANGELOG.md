# Changelog

All notable changes to `td-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The **wire protocol** is versioned separately from the package: `PROTOCOL_VERSION`
is a single integer, bumped only on breaking wire changes. A package release that
does not change `PROTOCOL_VERSION` works against an unchanged TouchDesigner
project. See [docs/protocol.md](docs/protocol.md).

## [Unreleased]

### Added

- **Per-stream on/off** — a stream's encoder can now be started and stopped from
  the web, live, with `<StreamToggle stream="tile1" />` (or
  `useVideo().setEnabled(id, on)` / `.toggle(id)`). Two new wire messages carry
  it: `stream-enable` (web → TD) and `stream-state` (TD → web). `PROTOCOL_VERSION`
  is unchanged — an older project simply never sends or understands them.

  **This is not signaling.** Every configured stream keeps its WebRTC track for
  the life of the connection, so a toggle renegotiates nothing and a stream
  resumes on TD's next frame. What it flips is the generated
  `videostreamout_<id>` TOP's `Active` par, which stops that TOP **and everything
  feeding it** — measured on a live four-tile wall, a disabled stream's whole
  `select`/`fit`/`flip`/`videostreamout` chain stops cooking outright, against
  ~0.25 ms of CPU cook time per frame plus GPU for each running encoder.

  That is what lets a project **announce more streams than it can afford to run
  at once**: list them all in `STREAMS`, start the expensive ones
  `'enabled': False`, and let the operator pick. `receivers` must still cover
  every entry, not just the running ones.

  State is TouchDesigner's, exactly as for a parameter: writes are optimistic and
  corrected by the next `stream-state`, and `WebGuiServerExt` now generates a
  `parexec_stream_active` Parameter Execute DAT watching every encoder's `Active`
  par, so a stream switched off **inside TD** updates the browser too. A refused
  write replies `unknown_stream` / `stream_unavailable` and re-announces the
  truth.

  `enabled(id)` returns `undefined` — not `false` — for an id TD hasn't spoken
  for, so `<StreamToggle>` renders disabled rather than claiming the stream is
  off. `streamStatus(id)` gains `'off'` (widening its return type to the new
  `TDStreamStatus`), and `<Video>` detaches its source when a stream is off, since
  a stopped encoder leaves the track live and silent and the element would
  otherwise hold its last decoded frame and read as running video.

- **`enabled` key on a `STREAMS` entry** (default `True`) — whether that stream
  _starts_ encoding. Read **only when the encoder is first created**: after that
  the `Active` par is the live state, so saving `config.py` (which rebuilds) no
  longer stomps a toggle. The generated operators are dropped on exit, so each
  session starts from the config's defaults again.

- **Per-stream `width` and `fps`** — a `STREAMS` entry can now cap what it costs
  to encode. `width` (default 480) is applied by a generated `fit_<id>` inserted
  between the select and the flip, in Limit Resolution mode so the aspect is
  preserved and a source already under the cap is never upscaled; `fps` (default 15) sets the Video Stream Out TOP's rate. Existing configs get both defaults,
  so a wall of streams no longer encodes at project resolution and project rate.

- **Readouts** — a `READOUTS` map in the project config publishes values that
  have no parameter behind them: one CHOP channel (`number`), several channels
  (`number[]`), one DAT cell (`string`), or a whole DAT table (`string[][]`).
  One-way, TD → web. The source is inferred from the entry's shape, and `type`
  is written only to override it (a 0/1 gate channel as `bool`, a numeric cell
  as `number`).

  Readouts **share the parameter namespace**: they ride the same `snapshot` and
  `update` messages, appear in the same TypeScript schema, and bind by name
  exactly like a parameter — so lazy signal allocation, shared signals, batching
  and every read-only component work on them unchanged. A name in both
  `REGISTRY` and `READOUTS` is a config error; the parameter wins and TD warns.
  See [docs/design-notes.md § Readouts](docs/design-notes.md#readouts).

- `touchdesigner/config-execute.py` — editing `config.py` while TouchDesigner is
  running now reaches the network on save. The `config` DAT already hot-reloaded
  the file, but nothing re-ran `Rebuild()`, so the generated watchers and stream
  chains silently described the config as it stood at the last extension init.
  `WebGuiServerExt` now generates a single `config_watch` DAT Execute DAT
  watching the config DAT, which re-runs `Rebuild()` on change. Table Change is
  the hook — the DAT Execute DAT has no text-change callback, and a Text DAT is a
  1×1 table holding the whole file — with `Execute = End of Frame` so a save that
  lands in pieces rebuilds once.

- `touchdesigner/chop-execute.py` and `touchdesigner/dat-execute.py` — the
  watcher callbacks behind readouts, generated per operator by `WebGuiServerExt`
  alongside the existing Parameter Execute DATs. Both only mark a name dirty;
  one coalesced `update` is sent at end of frame, because a CHOP Execute DAT
  fires per changed **sample** and can run several times per frame per channel.
  The generated DAT Execute DATs additionally set `Execute = End of Frame`,
  TouchDesigner's own per-frame coalescer.

- `<Table>` — read-only rendering of a `string[][]` readout, with an optional
  `header` row and a per-cell `format` receiving the cell's index in the
  original table. Rows and cells render index-keyed, so a table that changes
  every frame rewrites text in place. Class hook `.td-table`.

- `webserver-callbacks.readout_watches()` — public accessor for the operators
  and channels backing the readouts, so the generated watchers and the broadcast
  path share one implementation of the entry-shape rules (the counterpart to
  `par_names`).

- `touchdesigner/webgui-server-ext.py` — a `WebGuiServerExt` extension for the
  `WebGuiServer` component that generates one Parameter Execute DAT per operator
  the config's `REGISTRY` references, replacing the hand-configured DAT of
  setup step 4. Each generated DAT watches exactly that operator's registered
  parameters, with `Custom` / `Built-In` set per operator rather than globally.
  Call `Rebuild()` to reconcile; it is idempotent and writes nothing when the
  registry already matches what is live.
- `webserver-callbacks.par_names(entry)` — public accessor for the parameter
  names backing a registry entry, so the generated watchers and the broadcast
  path share one implementation of `number[]` ParGroup expansion.

### Changed

- `ParamValue` gains `string[][]`, for whole-table readouts. Additive, and
  `PROTOCOL_VERSION` stays `1` — every other wire type is untouched, so a
  project that declares no whole-table readouts is unaffected.
- **`parse` now validates `params` per entry rather than all-or-nothing.** An
  entry carrying an unrecognised value type is dropped and the rest of the map
  is kept; only a `params` that isn't an object at all nulls the message.
  Previously one bad value discarded the whole message, which for a `snapshot`
  meant the client never synced anything and the symptom pointed nowhere near
  the cause. This is also what keeps future wire-type additions from being
  breaking changes.
- An `update` or `pulse` aimed at a readout name is refused with
  `param_not_writable` rather than `unknown_param` — the name is real, it just
  has no writable side, and that code is what triggers the web's existing
  runtime read-only safety net.
- Generated DATs get their `File` as an expression resolved inside
  `op.WebGuiServer.par.Tdcoredir`, matching how the hand-placed callbacks DATs
  resolve their own sources. No new parameter is needed to locate the callback
  code, and repointing `Tdcoredir` moves every DAT at once rather than waiting
  for the next `Rebuild()`.
- `WebGuiServerExt.Rebuild()` reconciles on `(watcher kind, operator path)`
  rather than path alone, so one operator can carry watchers of different kinds.
  Existing generated DATs are matched by which parameter names their target
  (`op` / `chop` / `dat`), read off the operator rather than remembered in a tag.

### Compatibility

A `string[][]` readout requires the web side to be **newer than 0.1.0**: 0.1.0
validated `params` all-or-nothing, so a snapshot containing one is dropped
wholesale there. Every other readout type — CHOP channels, DAT cells — works
against 0.1.0 unchanged, as does any project declaring no whole-table readouts.

## [0.1.0] — 2026-07-25

First public release. Wire protocol version **1**.

### Added

**Connection**

- `createTDConnection(url, options)` — standalone WebSocket connection manager.
  Handshake (`hello` → `welcome` → `snapshot-request` → `snapshot`), reactive
  `status`, lazy per-parameter signal allocation, and focus-based echo
  suppression.
- Reconnect with exponential backoff and jitter, re-running the full handshake
  and snapshot resync on each attempt.
- Handshake watchdog — requires `welcome` **and** `snapshot` within a window of
  `onopen`, else abandons into backoff.
- Application-level `ping`/`pong` heartbeat for detecting half-open sockets.
- rAF-aligned outbound throttle, coalescing a frame's parameter writes into one
  `update` message.
- Backpressure — skips `update` sends while `bufferedAmount` is over a
  high-water mark, exposes a reactive `congested` flag, and forces a reconnect
  on sustained congestion.
- Read-only parameters, both statically declared (`readonly`) and marked at
  runtime by an inbound `param_not_writable` error.
- `pulse(name)` for momentary TouchDesigner parameters.
- `requestMenus()` / `menuOptions(name)` for TouchDesigner-announced menus.
- `subscribe(listener)` for observing inbound messages.

**Components**

- `<TextInput>` — string parameters, with `commitOn="input" | "enter"`,
  `multiline`, and `onCommit`.
- `<NumberInput>`, `<RangeInput>` — number parameters, with `min`/`max`/`step`.
- `<Toggle>`, `<Button mode="pulse" | "hold" | "toggle">` — bool and momentary
  parameters.
- `<Select>` — menu parameters, with web-authored or TouchDesigner-announced
  options.
- `<Vector>`, `<Color>` — multi-component (ParGroup) parameters.
- `<Value>` — read-only readout, with an optional `format` function.
- `<Video>` — one WebRTC stream, selected by announced stream id.

**Video**

- `createTDVideoStream(options)` — one WebRTC peer per instance carrying every
  one of that instance's video tracks, with signaling multiplexed over the
  control WebSocket.
- Trickle ICE in both directions, including `candidate: null` end-of-candidates.
- Per-stream status, rebuild-on-failure, and renegotiation handling (including
  glare resolution and negotiation deferred across a WebSocket gap).

**Typing**

- `createTDClient<Schema>()` — schema-bound bundle whose `Provider`, components,
  and `signal` helper are all generic over one instance's parameter map, so
  parameter names autocomplete and typos are compile errors inside JSX.

**TouchDesigner side**

- `touchdesigner/webserver-callbacks.py`, `parameter-execute.py`, and
  `webrtc-callbacks.py` — project-agnostic DAT callbacks implementing the
  TouchDesigner half of the protocol.
- `touchdesigner/config-template.py` — the single per-project file, mapping
  friendly wire names to backing operators and parameters.

[Unreleased]: https://github.com/cronin4392/td-web-gui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cronin4392/td-web-gui/releases/tag/v0.1.0
