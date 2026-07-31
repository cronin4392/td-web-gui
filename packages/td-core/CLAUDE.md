# td-core

The published library. Everything here ships to npm and is consumed by strangers.

## The rule that governs this package

**Nothing here may know about an application.** Not `apps/example`, not
`apps/vj-gui`. The vocabulary is instances, params, calls, streams, readouts,
menus — general TouchDesigner concepts. Scene, Effect, Layer, Loader, and
Wordbank are `apps/vj-gui`'s words and must never appear.

If an app needs a capability, generalize it and let the app name it.
`loadScene` in the protocol is the standing counterexample: an app concept that
leaked into the wire and is now a breaking change to remove.

## It's public API

Treat every export from `src/index.tsx` as a contract:

- Breaking changes go in `CHANGELOG.md` and follow semver.
- `PROTOCOL_VERSION` (in `src/wire.ts`) is **separate** from the package
  version and bumps only on a breaking wire change.
- Docs in `docs/` are shipped in the tarball (`files` in `package.json`), so a
  stale doc is a shipped bug.

## Both halves have to move together

`touchdesigner/*.py` is the other end of everything in `src/`. A wire change
means all three of:

1. the TypeScript side,
2. `touchdesigner/webserver-callbacks.py` (and `parameter-execute.py` if it
   touches broadcasts),
3. `docs/protocol.md`.

The Python half has **zero automated coverage** — it is the half that drifts
silently. Never report a change to it as verified; say it was untested and what
would exercise it. `touchdesigner/config-template.py` is the user-facing
template, so its docstring is documentation.

## Testing

The suite runs a stub TouchDesigner in-memory — `src/testing/mockTD.ts` (stub
WebSocket server) and `src/testing/mockRTC.ts` (faked `RTCPeerConnection`) — so
the full wire contract runs without a live `.toe`. Prefer extending those fakes
over mocking at the call site.

`src/scheduler.ts` and `src/testing/scheduler.ts` exist so rAF-throttled and
timer-driven behavior is deterministic in tests. Don't reach for real timers.

`regressions.test.tsx` and `resilience.test.ts` encode bugs that already
happened once. Adding to them is usually the right move for a bugfix.

## Before writing new code

`docs/design-notes.md` explains the non-obvious decisions — optimistic writes
and echo suppression, one signal per name, readouts sharing the parameter
namespace, why video rebuilds rather than ICE-restarts, and a **Non-obvious
TouchDesigner behavior** section for TD facts that contradict the reasonable
assumption. Read the relevant section before changing behavior it covers; most
"that looks wrong" instincts here are already answered.

The library ships **zero CSS** and treats `solid-js` as a peer dependency. Don't
add either.
