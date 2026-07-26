# Changelog

All notable changes to `td-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The **wire protocol** is versioned separately from the package: `PROTOCOL_VERSION`
is a single integer, bumped only on breaking wire changes. A package release that
does not change `PROTOCOL_VERSION` works against an unchanged TouchDesigner
project. See [docs/protocol.md](docs/protocol.md).

## [Unreleased]

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
