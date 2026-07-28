# Bidirectional named calls (web ⇄ TouchDesigner)

## Context

`td-core` today syncs **state**: named params flow both ways via `snapshot`/`update`, and `pulse`
fires a momentary TD parameter. There is no way to invoke _behaviour_ on the far side — nothing
that says "run this now, here are some arguments, tell me what came back". `pulse` looks close but
isn't: it carries no payload, returns nothing, and is hard-wired to `par.pulse()` on a registered
TD parameter.

This adds a general **named-handler call channel** in both directions, with a result:

- Web → TD: `await TD.call('print', { text: 'hi' })` runs a Python function registered in the
  project's `config.py` and resolves with whatever it returns.
- TD → web: `parent.WebGuiServer.Notify('alert', {'text': 'hi'})` runs a JS handler the page
  registered, with an optional callback form for the reply.

No arbitrary `eval`/`exec` — handlers are registered by name on each side, matching how `REGISTRY`
and `READOUTS` already work. Both example projects get wired up to demonstrate it.

**Envoy MCP is not available in this session** (`.mcp.json` points at port 9870; no `mcp__envoy__*`
tools loaded). This feature needs **no new TD operators** — only edits to two hot-synced `.py`
files — so it can be built entirely from the filesystem. Live verification in TD is a manual step
at the end.

## Wire protocol

Two new symmetric message types in `packages/td-core/src/wire.ts`. Adding types is
forward-compatible per `docs/protocol.md § Forward compatibility` — **no `PROTOCOL_VERSION` bump**.

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/** Invoke a named handler on the far side. Omit `id` for fire-and-forget. */
export interface CallMessage {
  type: 'call';
  id?: string;
  name: string;
  args?: JsonValue;
}

/** Reply to a `call` that carried an `id`. Exactly one of `value` / `error`. */
export interface CallResultMessage {
  type: 'result';
  id: string;
  value?: JsonValue;
  error?: { code: string; message?: string };
}
```

Both go in **both** `ClientMessage` and `ServerMessage` (like the `rtc-*` types), both strings join
`KNOWN_TYPES`, and both get a `case` in `parse`. Validation is cheap — `id`/`name`/`error.code` must
be strings when present; `args`/`value` pass through untouched, since anything out of `JSON.parse`
is a `JsonValue` by construction. Fold the failure into `result` rather than adding a third type,
and keep it **separate from the existing `error` message** — `error` has connection-level semantics
(`handleError` sets `lastError` and re-requests a snapshot on `param_not_writable`), which a failed
call must not trigger.

Error codes: `unknown_handler`, `handler_error`, `result_not_serializable` (far side);
`call_timeout`, `call_disconnected`, `call_congested` (raised locally, never on the wire).

## Web side — `packages/td-core/src/`

**`calls.ts`** (new) — the pending-call table and handler registry, built to be driven by
`connection.ts` rather than owning the socket:

- `createCallRegistry({ send, scheduler, timeout })` returning `{ call, notify, handle, onMessage, reset }`.
- Ids: a per-connection random prefix + monotonic counter, so ids can't collide across a reconnect.
- `reset(reason)` rejects every pending call with `call_disconnected`. **Called on every socket
  close** — a Promise must settle; it may not hang across a reconnect the way a dropped `pulse` is
  silently discarded.
- `TDCallError extends Error` carrying `.code` and optional `.callName`, so `catch` blocks can
  branch on the cause.

**`connection.ts`**:

- `TDConnectionOptions.callTimeout?: number` (default `10_000`), routed through
  `options.scheduler` so `createManualScheduler()` can drive it in tests. Add `DEFAULT_CALL_TIMEOUT`
  beside the existing timing constants at line ~271.
- Three members on `TDConnection` (interface at line 211):
  - `call(name, args?, opts?): Promise<JsonValue | undefined>`
  - `notify(name, args?): void` — same `call` message with no `id`, no reply expected
  - `handle(name, fn): () => void` — register a handler, returns an unregister fn (mirrors `subscribe`)
- In `handleMessage` (line ~499): `case 'call'` → dispatch to the registry (async handlers
  supported; a throw or rejection becomes `handler_error`); `case 'result'` → settle the pending
  entry. Both still fan out to `subscribe()` listeners afterwards, unchanged.
- Send path: reuse the existing guards. Disconnected → reject `call_disconnected`;
  `bufferedAmount > highWaterMark` → `markCongested()` + reject `call_congested`. `notify` follows
  `sendPulse`'s drop-and-debug-log behaviour instead, since there is no Promise to settle.
- Wire `reset()` into the existing close/teardown path so a drop clears the table.

**`context.tsx`**:

- `createTDHandler(name, fn)` beside `createTDSignal` — registers on the nearest provider's
  connection and calls `onCleanup(unregister)`. This is the safe default for components; a raw
  `connection.handle()` inside a component would leak a handler on every remount.
- `createTDClient<Schema, Calls, Handlers>()` — two new **optional** generics, so every existing
  `createTDClient<Example1Params>()` call site keeps compiling:
  ```ts
  export interface CallSignature {
    args?: JsonValue;
    result?: JsonValue;
  }
  export type CallSchema = Record<string, CallSignature>;
  ```
  `Calls` = what TD exposes (typing `call`/`notify`); `Handlers` = what the web exposes (typing
  `handle`). Two namespaces because the directions are independent. Add `call`, `notify`, `handle`
  to the returned bundle, following the existing compile-time-wrapper-over-untyped-runtime pattern
  used by `signal`/`pulse`.

**`index.tsx`** — export `JsonValue`, `CallMessage`, `CallResultMessage`, `TDCallError`,
`CallSignature`, `CallSchema`, `createTDHandler`.

## TouchDesigner side — `packages/td-core/touchdesigner/`

**`webserver-callbacks.py`**:

- `_handlers()` → `getattr(_config(), "HANDLERS", {})`, matching how `WEBRTC` degrades gracefully
  so configs predating this change keep working.
- Two branches in `onWebSocketReceiveText` (line ~1011), added before the trailing
  "Unknown types ignored" comment:
  ```python
  elif mtype == "call":   _handle_call(client, message)
  elif mtype == "result": _handle_result(message)
  ```
- `_handle_call`: look the name up in `HANDLERS`; call it inside `try/except`. On exception, `print`
  the traceback (so it lands in the Textport) **and** reply `handler_error`. Before replying,
  `json.dumps` the return value inside its own `try/except` → `result_not_serializable`. When the
  inbound `call` carried no `id`, run the handler and send nothing.
- TD → web, **callback-based, never blocking**. TD's main thread runs the frame; blocking on a
  browser reply would freeze it, which `.claude/rules/td-python.md § Threading` forbids outright:
  ```python
  def notify(name, args=None, client=None)                      # broadcast; no reply
  def call(name, args=None, on_result=None, on_error=None,
           client=None, timeout=10.0)                           # one client; reply via callback
  ```
  `call` needs a single target: default to the sole connected client, and invoke `on_error` with
  `call_disconnected` when there are 0 or >1 (consistent with the existing v1 single-viewer stance
  in `docs/design-notes.md`). Expiry via `run("...module._expire_call(...)", delayFrames=...)`,
  the same deferral mechanism `attach_streams` and `flush_readouts` already use.
- `_handle_result` looks the id up in the pending map and fires `on_result` / `on_error`.
- Extend the module docstring's message table with `call` / `result` and the new error codes.

**`webgui-server-ext.py`** — public `Call()` / `Notify()` delegating to the callbacks module, so
project code writes `parent.WebGuiServer.Notify('alert', {'text': 'hi'})` rather than reaching
through `op.WebGuiServer.op('webserver1_callbacks').module`. Place beside `StreamTop` (line 182).
No changes to `Rebuild()` — handlers generate no operators.

**`config-template.py`** — a commented `HANDLERS = {}` section documenting the signature
(`fn(args) -> JSON-serializable`) and both directions.

## Example app

**`apps/example/td/Example1/config.py`** — add handlers plus a docstring note on firing web
handlers from TD:

```python
def _print(args):
    print("web says:", (args or {}).get("text", ""))
    return {"ok": True}

def _echo(args):
    return {"echo": args, "frame": absTime.frame}

HANDLERS = {"print": _print, "echo": _echo}
```

**`apps/example/src/td.config.ts`** — `Example1Calls` and `Example1Handlers` interfaces beside the
existing `Example1Params`.

**`apps/example/src/App.tsx`** — a "Calls" section in `Example1Panel`:

- text field + button → `await Example1.call('print', { text })`, rendering the resolved result
- "echo" button → round-trips and displays the returned JSON (proves the Promise path)
- `createTDHandler('alert', (a) => alert(a.text))` so TD can pop a browser alert
- a `TDCallError` `catch` rendering `.code`, so `unknown_handler` and `call_timeout` are visible

`apps/example/index.css` gets the few `.td-*`-adjacent rules the new section needs.

## Tests

`packages/td-core/src/calls.test.ts` (new), following `resilience.test.ts`'s structure — mock
socket + `createManualScheduler()`, no real timers:

- web → TD: outbound frame shape; `result` resolves; `error` result rejects with the right `.code`
- `call_timeout` fires after `callTimeout` via `scheduler.advance()`
- socket close rejects every in-flight call with `call_disconnected`
- `notify` sends a `call` with **no** `id` and creates no pending entry
- TD → web: an inbound `call` reaches a registered handler and replies `result`; an async handler
  is awaited; a throwing handler replies `handler_error`; an unregistered name replies
  `unknown_handler`
- `createTDHandler` unregisters on unmount (render + dispose, assert the next inbound `call`
  answers `unknown_handler`)

`src/testing/mockTD.ts` gains `serverCall(name, args)` returning a Promise of the client's `result`,
and auto-answers inbound `call`s from a `handlers` option. `src/index.test.ts` gains the new
exports.

## Docs — `packages/td-core/docs/`

- `protocol.md` — a "Calls" section with the catalog entries, JSON examples, and error codes
- `api.md` — `call`/`notify`/`handle`, `createTDHandler`, `callTimeout`, the `Calls`/`Handlers` generics
- `touchdesigner-setup.md` — writing `HANDLERS`, and `Call()`/`Notify()` from project code
- `design-notes.md` — why TD's outbound `call` is callback-based rather than blocking; why the
  pending table clears on disconnect; why `result` is separate from `error`
- `troubleshooting.md` — "a call never resolves" / `unknown_handler` / handler traceback in the Textport

Per `CLAUDE.md`, implementation code stays comment-free; the rationale above lives in these docs.

## Verification

1. `pnpm --filter td-core test` — the new `calls.test.ts` plus the existing suites, unchanged.
2. `pnpm --filter td-core typecheck` and `pnpm --filter example typecheck` — the added generics
   must not break existing `createTDClient<Params>()` call sites.
3. `pnpm --filter td-core build`, then `pnpm --filter example dev`.
4. With `Example.toe` open (`Tdcoredir` already points at `packages/td-core/touchdesigner`, so both
   edited `.py` files hot-sync — no reopen needed):
   - Type into the field, click "print in TD" → the string appears in TD's Textport, and the web
     renders `{ok: true}`.
   - Click "echo" → the returned JSON, including TD's current frame, renders in the browser.
   - From TD's Textport: `parent.WebGuiServer.Notify('alert', {'text': 'hello from TD'})` → the
     browser pops an alert.
   - Call an unregistered name → the UI shows `unknown_handler` rather than hanging.
   - Stop TD mid-call → the pending call rejects with `call_disconnected`.
5. Regression: parameters, readouts, menus, and video still work in both example columns.
