# API reference

Component props live in [components.md](components.md). This covers everything
else: the factory, the provider, the connection, video, and the primitives.

- [`createTDClient`](#createtdclient)
- [`<Provider>`](#provider)
- [Scoping](#scoping)
- [Connection](#connection)
- [Bindings](#bindings)
- [Calls](#calls)
- [Video](#video)
- [Multiple instances](#multiple-instances)
- [Standalone use](#standalone-use)
- [Wire helpers](#wire-helpers)
- [Testing](#testing)

## `createTDClient`

```ts
function createTDClient<
  Schema extends ParamSchema<Schema>,
  Calls extends CallSchema<Calls> = Record<string, CallSignature>,
  Handlers extends CallSchema<Handlers> = Record<string, CallSignature>,
>(): TDClient<Schema, Calls, Handlers>;
```

Returns a **schema-bound bundle** for one TD instance. Call it once, at module
scope.

`Calls`/`Handlers` are optional and independent of `Schema` and of each other:
`Calls` types what this instance exposes for the web to `call`/`notify`;
`Handlers` types what the web exposes for TD to `handle`. Both default to a
permissive schema, so every existing single-generic `createTDClient<Params>()`
call site keeps compiling unchanged. See [Calls](#calls).

```ts
import { createTDClient } from 'td-core';

interface MixerParams {
  message: string;
  intensity: number;
  enabled: boolean;
  position: number[];
}

const Mixer = createTDClient<MixerParams>();
```

The bundle:

| Member                                                                                             | Type                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Provider`                                                                                         | Context provider owning one connection (see below)                                     |
| `signal(name)`                                                                                     | `TDBinding<Schema[K]>` — bind a signal to a parameter                                  |
| `useConnection()`                                                                                  | `TDConnection<Schema, Calls, Handlers>` — this factory's nearest provider, fully typed |
| `useVideo()`                                                                                       | `TDVideoStream` — this factory's nearest provider's peer                               |
| `TextInput` `NumberInput` `RangeInput` `Toggle` `Button` `Select` `Vector` `Color` `Value` `Table` | Bound controls, `name` narrowed to matching schema keys                                |
| `Video` `StreamToggle`                                                                             | Bound to a stream id; not schema-typed (ids aren't parameters)                         |

### Why a factory rather than plain components

TypeScript can't flow a generic from `<Provider<Schema>>` down into a
free-floating `<TextInput>` child — a standalone component's prop types can't
depend on which provider happens to sit above it. Binding the schema once into a
component bundle is what makes `name` checked _where you actually write it_, in
JSX, with autocomplete.

`name` is narrowed per component to the schema keys whose type matches:
`Mixer.RangeInput` accepts only `number`-valued keys, `Mixer.Toggle` only
`boolean` ones, `Mixer.Table` only `string[][]` ones. `Value` and `Button` accept
any key — a readout works across every type, and `mode="pulse"` binds a momentary
parameter that isn't part of the value schema at all.

**Readouts are schema keys like any other.** A `READOUTS` entry (a CHOP channel,
DAT cell, or DAT table with no parameter behind it) rides the same wire messages
and belongs in the same interface — declare it by its wire type and list it in
`readonly`:

```ts
interface MixerParams {
  intensity: number; // a parameter
  fps: number; // a readout — one CHOP channel
  cues: string[][]; // a readout — a whole DAT table
}
```

The generics are compile-time, but the **bundle is not**. Each factory owns its
own contexts, so everything reached through the bundle — `Provider`, `signal`,
`useConnection`, `useVideo`, and every typed component — resolves to a provider
of that same factory. See [Scoping](#scoping).

## `<Provider>`

Owns one instance's connection (and at most one WebRTC peer) and shares them with
its subtree.

```tsx
<Mixer.Provider url="ws://localhost:9980" instance="mixer" readonly={['fps']}>
  {/* … */}
</Mixer.Provider>
```

| Prop       | Type                              | Description                                                                                              |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `url`      | `string`                          | WebSocket URL of this instance's Web Server DAT. Read once at setup.                                     |
| `instance` | `string`                          | Config id for this instance. Authoritative over TD's `welcome` metadata.                                 |
| `readonly` | `string[]`                        | Parameter names to declare read-only. Bound controls render disabled and warn; never sent over the wire. |
| `options`  | `TDConnectionOptions`             | Per-connection tuning, forwarded to `createTDConnection`.                                                |
| `video`    | `boolean \| TDVideoStreamOptions` | Open a WebRTC peer. Opt-in — without it, no `RTCPeerConnection` is created.                              |

Everything is read once at setup. Changing `url` or `video` mid-life would mean
tearing down a socket or peer, which unmounting the provider already does.

**Teardown is automatic.** On unmount the provider closes its socket, cancels
every timer, closes the peer, calls `stop()` on every received track so the
browser frees the hardware decoder, and drops the routing table. Each provider
tears down only its own instance.

### `readonly`

Author it beside your schema. This is a web-side declaration — no wire-format
change, and TD isn't consulted:

```ts
interface MixerParams {
  intensity: number;
  fps: number;
}

const readonly = ['fps'] as const satisfies readonly (keyof MixerParams)[];
```

```tsx
<Mixer.Provider url={url} readonly={readonly}>
  <Mixer.RangeInput name="intensity" min={0} max={1} />
  <Mixer.Value name="fps" format={(n) => `${Number(n).toFixed(1)} fps`} />
</Mixer.Provider>
```

A parameter can also become read-only at runtime: an inbound
`param_not_writable` error marks that name from then on and re-requests a
snapshot, so an optimistic edit TD refused snaps back instead of sticking. See
[design-notes.md § Parameter modes](design-notes.md#parameter-modes).

**List your readouts here too.** TD refuses a write to one either way, through
that same runtime path — declaring it statically just means the control is
disabled from the start rather than after the first refused edit.

### `options`

Every timing constant is a per-connection option with a sane default, not
something baked into the wire format — a slower or remote deployment can loosen
them without a protocol change.

| Option                            | Default             | Description                                                                                            |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `reconnect`                       | `true`              | Auto-reconnect on an unexpected drop.                                                                  |
| `backoff.min` / `backoff.max`     | `500` / `10000` ms  | First retry delay and ceiling, before jitter.                                                          |
| `handshakeTimeout`                | `5000` ms           | Window for `welcome` **and** `snapshot` after the socket opens.                                        |
| `heartbeat.interval` / `.timeout` | `5000` / `10000` ms | `ping` cadence, and grace for a `pong` before forcing a reconnect. Pass `heartbeat: false` to disable. |
| `backpressure.highWaterMark`      | `1048576` bytes     | `bufferedAmount` above which `update`s are skipped.                                                    |
| `backpressure.timeout`            | `5000` ms           | Sustained congestion before forcing a reconnect.                                                       |
| `callTimeout`                     | `10000` ms          | How long `call()` awaits a `result` before rejecting `call_timeout`.                                   |
| `protocol`                        | `PROTOCOL_VERSION`  | Version advertised in `hello`.                                                                         |
| `onError`                         | `console.error`     | Handler for inbound `error` messages. Never fatal.                                                     |
| `readonly`                        | `[]`                | Same as the `readonly` prop, which takes precedence.                                                   |
| `WebSocket`                       | global              | Constructor override. For tests.                                                                       |
| `scheduler`                       | platform timers     | Timer/rAF override. For tests.                                                                         |
| `random`                          | `Math.random`       | Backoff jitter source. For tests.                                                                      |

## Scoping

One rule covers every way of reaching a connection:

> **Anything reached through a factory bundle is factory-scoped. Anything
> imported bare from `td-core` binds to the nearest provider of any factory.**

| Reached as                                                                    | Binds to                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| `Factory.signal` · `Factory.useConnection` · `Factory.useVideo`               | the nearest `<Factory.Provider>`            |
| `Factory.TextInput` · `Factory.Value` · `Factory.Video` · every typed control | the nearest `<Factory.Provider>`            |
| `createTDSignal` · `useTDConnection` · `useTDVideoStream` · `createTDHandler` | the nearest `<Provider>` of **any** factory |
| `<Value>` · `<Toggle>` · `<Video>` · any component imported from `td-core`    | the nearest `<Provider>` of **any** factory |

"Nearest `<Factory.Provider>`" means exactly that: other factories' providers in
between are skipped, however deeply they nest.

That is what lets one subtree read two instances. A `<Mixer.Value>` rendered
inside a `<Render.Provider>` still reads the mixer, as long as a
`<Mixer.Provider>` is somewhere above it:

```tsx
<Mixer.Provider url="ws://localhost:9980" instance="mixer">
  <Render.Provider url="ws://localhost:9981" instance="render">
    <Render.RangeInput name="opacity" min={0} max={1} step={0.01} />

    {/* reaches past the render provider to the mixer's */}
    <Mixer.Value name="intensity" />

    {/* bare import: the nearest provider of any factory — render's */}
    <Value name="opacity" />
  </Render.Provider>
</Mixer.Provider>
```

Nesting is **not** a substitute for a provider of your own factory: a bundle
member with none above it throws `no TD connection in context`, exactly as it
does outside every provider.

**Providers from the same factory still nest nearest-wins**, which is how one
factory serves several instances of a shared schema — each subtree gets the
closest `<Factory.Provider>` above it.

Sibling (non-nested) providers are unaffected by any of this: a subtree with
exactly one provider above it resolves the same either way, which is why most
apps never have to think about scoping at all.

## Connection

`Mixer.useConnection()` returns the nearest `<Mixer.Provider>`'s connection,
whatever other factories' providers sit in between (see [Scoping](#scoping)).

```tsx
function StatusBar() {
  const conn = Mixer.useConnection();
  return <span>{conn.status()}</span>;
}
```

| Member                     | Type                                             | Description                                                             |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `status()`                 | `'connecting' \| 'open' \| 'synced' \| 'closed'` | Reactive lifecycle.                                                     |
| `congested()`              | `boolean`                                        | Reactive: `update` sends are being skipped for backpressure.            |
| `lastError()`              | `ErrorMessage \| undefined`                      | Most recent inbound `error`.                                            |
| `signal(name)`             | `TDBinding`                                      | Create-or-return the shared binding for a name.                         |
| `pulse(name)`              | `void`                                           | Fire a momentary parameter.                                             |
| `call(name, args?, opts?)` | `Promise<JsonValue \| undefined>`                | Invoke a named TD handler, awaiting its `result`.                       |
| `notify(name, args?)`      | `void`                                           | Fire-and-forget form of `call` — no reply expected.                     |
| `handle(name, fn)`         | `() => void`                                     | Register a handler for a named call TD sends. Returns an unregister fn. |
| `isReadonly(name)`         | `boolean`                                        | Reactive read-only state.                                               |
| `menuOptions(name)`        | `MenuOption[] \| undefined`                      | Menu options TD announced for a name.                                   |
| `requestMenus()`           | `void`                                           | Ask TD to re-read and re-announce its menus.                            |
| `send(message)`            | `void`                                           | Low-level client-message send. No-op unless open.                       |
| `subscribe(listener)`      | `() => void`                                     | Observe every parsed inbound message. Returns an unsubscribe.           |
| `close()`                  | `void`                                           | Close the socket, cancel timers, drop the routing table.                |

### `status`

`connecting` → `open` (socket up, handshake in flight) → `synced` (snapshot
applied). An unexpected drop returns to `connecting` while backoff runs.
`closed` is terminal and only reached through `close()` or teardown.

Before the snapshot lands, bound signals are `undefined` and controls render
their natural empty state. Inputs are **not** disabled by default — on localhost
the snapshot is effectively instant — but `status()` is there if you want to gate
or skeleton your UI.

```tsx
<Show when={conn.congested()}><strong>congested</strong></Show>
<Show when={conn.lastError()}>{(e) => <span>error: {e().code}</span>}</Show>
```

## Bindings

`signal(name)` returns a live binding. Use it for custom controls; the bundled
components use it internally.

```ts
interface TDBinding<T> {
  value: Accessor<T | undefined>;
  setValue: (value: T, options?: { throttle?: boolean }) => void;
  beginEdit: () => void;
  endEdit: () => void;
  readonly: Accessor<boolean>;
}
```

All binders of the same name share **one** signal, so an optimistic write from
one control is instantly visible in every other, and a TD update fans out to all
of them.

Call `beginEdit()` on focus or drag-start and `endEdit()` on blur or drag-end.
That's what suppresses TD echoes while the user is editing. It's a count, not a
flag, so overlapping editors work without special-casing — but every `beginEdit`
needs its `endEdit`, or the parameter stops accepting inbound updates.

`setValue(v, { throttle: true })` coalesces the wire send to one message per
animation frame. The local write is still immediate.

```tsx
function Knob(props: { name: string }) {
  const binding = createTDSignal<number>(props.name);
  return (
    <input
      type="range"
      value={binding.value() ?? 0}
      disabled={binding.readonly()}
      onInput={(e) => binding.setValue(Number(e.currentTarget.value), { throttle: true })}
      onFocus={() => binding.beginEdit()}
      onBlur={() => binding.endEdit()}
    />
  );
}
```

`createTDSignal(name)` is the free-standing form of the same thing. It is a bare
export, so it binds to the nearest provider of **any** factory — which is what
makes a custom component reusable across instances with no schema and no
instance prop threaded through. Use `Factory.signal(name)` when you want the
schema typing and the guarantee that it reads _that_ factory's instance. See
[Scoping](#scoping).

## Calls

Named-handler invocation, in both directions, riding the `call`/`result`
messages (see [protocol.md § Calls](protocol.md#calls)).

**Web → TD**, on the connection:

```tsx
function Toolbar() {
  // Captured at setup. Solid resolves context from the current owner, and an
  // event handler running after paint has none — so reach for the connection
  // here, not inside the handler.
  const td = Mixer.useConnection();
  return <button onClick={() => void td.call('print', { text: 'hi' })}>Print</button>;
}
```

`useConnection()` returns the connection typed by this factory's
`Schema`/`Calls`/`Handlers`, so `call`, `notify`, `handle`, `pulse` and `signal`
all narrow to the names you declared. It works with any number of providers
mounted from the factory — each subtree gets the connection of the nearest
`<Provider>` from **this** factory, skipping any other factory's providers in
between. See [Scoping](#scoping).

`call` rejects with a `TDCallError` (`.code`, `.callName`) on `unknown_handler`,
`handler_error`, `result_not_serializable` (from TD), `call_timeout` (no reply
within `callTimeout`), `call_disconnected`, or `call_congested`.
`notify(name, args?)` is the fire-and-forget form — same guards, no pending
entry, no reply to await.

```tsx
try {
  const result = await td.call('print', { text });
} catch (error) {
  if (error instanceof TDCallError) console.error(error.code);
}
```

**TD → web**, via `createTDHandler` inside a component (self-unregisters on
unmount — the safe default) or `connection.handle()` for code that manages its
own lifecycle:

```tsx
import { createTDHandler } from 'td-core';

function AlertHandler() {
  createTDHandler<{ text: string }>('alert', (args) => {
    alert(args.text);
  });
  return null;
}
```

**`createTDHandler` is a bare export, so it registers on the nearest provider of
_any_ factory** — the same rule as `createTDSignal` and `useTDConnection` (see
[Scoping](#scoping)). That is deliberate: it makes one handler component
reusable across instances, and it is the only thing `createTDHandler` adds over
`handle()` — an `onCleanup` that unregisters on unmount.

There is no `Factory.createHandler`. When you want the handler on a _named_
instance, and its `name`/args type-checked against that factory's `Handlers`,
register it on the connection during setup and unregister yourself:

```tsx
function AlertHandler() {
  const td = Mixer.useConnection(); // this factory's nearest provider
  onCleanup(td.handle('alert', (args) => alert(args.text)));
  return null;
}
```

`handle()` returns its unregister function, so that is the same lifetime
`createTDHandler` gives you, one line longer and factory-scoped.

TD fires it with `parent.WebGuiServer.Notify('alert', { text: 'hi' })` (no
reply) or `parent.WebGuiServer.Call('alert', { text: 'hi' }, on_result=fn)`
(reply via callback) — see
[touchdesigner-setup.md § Handlers](touchdesigner-setup.md#handlers).

### The `Calls`/`Handlers` generics

```ts
export interface CallSignature {
  args?: JsonValue;
  result?: JsonValue;
}
export type CallSchema<Schema> = { [K in keyof Schema]: CallSignature };
```

Two independent, optional generics on `createTDClient`:

```ts
interface MixerCalls {
  print: { args: { text: string }; result: { ok: boolean } };
}
interface MixerHandlers {
  alert: { args: { text: string } };
}

const Mixer = createTDClient<MixerParams, MixerCalls, MixerHandlers>();
```

`Calls` types `call`/`notify` (what TD exposes); `Handlers` types `handle` (what
the web exposes), both on the connection `Mixer.useConnection()` returns. Both
default to a permissive schema, so
`createTDClient<MixerParams>()` — no `Calls`/`Handlers` — keeps compiling
exactly as before. `CallSchema<Schema>` is written the same way as
`ParamSchema<Schema>` (a self-referential mapped type), so a plain
`interface { print: {...} }` satisfies it without needing an index signature.

## Video

`Mixer.useVideo()` returns the nearest `<Mixer.Provider>`'s peer — factory-scoped
like the rest of the bundle. Throws if that provider didn't opt into `video`. The
bare `useTDVideoStream()` takes the nearest provider of any factory instead; see
[Scoping](#scoping).

| Member               | Type                                                        | Description                                                    |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `status()`           | `'connecting' \| 'connected' \| 'reconnecting' \| 'closed'` | Reactive peer-wide status.                                     |
| `streams()`          | `StreamInfo[]`                                              | Reactive `{ id, mid, label }` list TD last announced.          |
| `stream(id?)`        | `MediaStream \| undefined`                                  | Decoded stream for an id. Omit `id` for the primary.           |
| `streamStatus(id?)`  | `TDStreamStatus`                                            | Per-stream status — the peer's, plus `'off'`.                  |
| `enabled(id?)`       | `boolean \| undefined`                                      | Whether TD is encoding this stream. `undefined` until TD says. |
| `setEnabled(id, on)` | `void`                                                      | Start or stop TD's encoder for this stream.                    |
| `toggle(id)`         | `void`                                                      | `setEnabled` against the current state.                        |
| `rebuild()`          | `void`                                                      | Tear down and renegotiate from scratch.                        |
| `close()`            | `void`                                                      | Close the peer, stop every track, unsubscribe from signaling.  |

**Read `streamStatus(id)`, not `status()`, for a per-tile overlay.** The peer
reaches `connected` as soon as _any_ track flows, so a tile still waiting for its
own track would otherwise show a frozen black box with no explanation.

```tsx
<For each={video.streams()}>
  {(s) => (
    <div class="tile">
      <Mixer.Video stream={s.id} />
      <Show when={video.streamStatus(s.id) !== 'connected'}>
        <div class="overlay">{video.streamStatus(s.id)}…</div>
      </Show>
    </div>
  )}
</For>
```

Driving the grid off `streams()` rather than a fixed count is what makes a short
announce visible as _missing_ tiles instead of silently black ones.

### Turning a stream off

`setEnabled(id, false)` stops TD **encoding** that stream. It does not touch the
peer: every configured stream keeps its track for the life of the connection, so
this costs no renegotiation and video resumes on TD's next frame. TD-side, an off
stream stops the encoder and everything feeding it, so it costs nothing while off
— which is what lets an instance announce more streams than it can afford to run
at once.

State is TD's, exactly as for a parameter: `setEnabled` applies optimistically and
every client is corrected by TD's next `stream-state`, whether the flip came from
a browser or from TD's own parameter dialog. `enabled()` distinguishes
`undefined` ("TD hasn't said", or no encoder exists for that id) from `false`, so
a control can disable itself rather than claim the stream is off.

`streamStatus(id)` reports `'off'` for these, and `<Video>` detaches its source —
a stopped encoder leaves the track live and silent, so the element would otherwise
hold its last decoded frame and read as running video.

Most apps want [`<StreamToggle>`](components.md#streamtoggle) rather than these
directly.

### Options

| Option                                            | Default     | Description                                                                                                                         |
| ------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `receivers`                                       | `1`         | How many `recvonly` video m-lines the offer carries — the ceiling on how many tracks TD can attach. Must be ≥ your `STREAMS` count. |
| `iceServers`                                      | `[]`        | Browser and TD share a machine, so host candidates always pair. Kept as an option in case TD ever runs elsewhere.                   |
| `offerRole`                                       | `'browser'` | Which side sends the initial offer.                                                                                                 |
| `disconnectedGrace`                               | `2000` ms   | How long a `disconnected` peer is tolerated before rebuild.                                                                         |
| `RTCPeerConnection` / `MediaStream` / `scheduler` | globals     | Overrides. For tests.                                                                                                               |

One peer per instance carries _all_ of that instance's tracks, which keeps
connection and ICE overhead down. `<Video stream="…">` selects among them.

## Multiple instances

One factory per _schema_, not per instance. A factory's components and
`useConnection()` bind to the nearest provider **from that factory**, so several
instances that share a schema share one factory, each under its own provider.

```tsx
const Mixer  = createTDClient<MixerParams>()
const Render = createTDClient<RenderParams>()

<Mixer.Provider url="ws://localhost:9980" instance="mixer">
  <Mixer.RangeInput name="intensity" min={0} max={1} step={0.01} />
</Mixer.Provider>

<Render.Provider url="ws://localhost:9981" instance="render" video>
  <Render.NumberInput name="opacity" min={0} max={1} step={0.01} />
  <Render.Video />
</Render.Provider>
```

Each instance gets its own socket, peer, status signal, throttle state, and
backoff schedule. One dropping or reconnecting does not affect the others.

Those two providers are siblings above, but they need not be. Nesting them is
safe and is how a control for one instance renders inside another's subtree —
`<Mixer.Value>` under a `<Render.Provider>` still reads the mixer. See
[Scoping](#scoping).

Keep the instance list in your app, not in `td-core` — the library stays
config-agnostic and just receives URLs:

```ts
// src/td.config.ts
const host = import.meta.env.VITE_TD_HOST ?? 'localhost';
const port = import.meta.env.VITE_TD_PORT ?? '9980';

export const instances = [{ id: 'mixer', url: `ws://${host}:${port}` }] as const;
```

**The config `id` is authoritative; TD's `welcome` metadata is advisory.** If
they disagree, the config wins and the mismatch is debug-logged — a misconfigured
TD project can't silently steal another instance's bindings.

## Standalone use

`createTDConnection` needs no context and no component tree, so non-component
code can talk to TD directly.

```ts
import { createTDConnection } from 'td-core';

const conn = createTDConnection('ws://localhost:9980');
const intensity = conn.signal('intensity');

createEffect(() => console.log(intensity.value()));
intensity.setValue(0.5);
```

Inside a component tree it registers its own `onCleanup`. Standalone, call
`close()` yourself.

`createTDVideoStream({ connection })` is likewise usable on its own; it takes the
connection to ride and observes signaling through `subscribe()`.

## Wire helpers

| Export                      | Description                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PROTOCOL_VERSION`          | Wire protocol integer. See [protocol.md](protocol.md).                                                                                                                                     |
| `parse(raw)`                | Parse an inbound payload to a `Message`, or `null` if malformed/unknown.                                                                                                                   |
| `escapeNewlines(text)`      | Real newlines → TD's two-character `\n` escape.                                                                                                                                            |
| `unescapeNewlines(wire)`    | The inverse, for showing a TD string in a `<textarea>`.                                                                                                                                    |
| `createTDHandler(name, fn)` | Register a call handler on the nearest provider of **any** factory, unregistering on cleanup. Factory-scoped alternative: `Factory.useConnection().handle(name, fn)`. See [Calls](#calls). |
| `TDCallError`               | Thrown by a rejected `call()`; carries `.code` and `.callName`.                                                                                                                            |

`unescapeNewlines` is deliberately naive — it doesn't honour a backslash-escaped
backslash, so text whose literal content is `C:\name` comes back with a line
break. Only parameters you explicitly mark `multiline` go through it, and those
hold prose, not paths.

Every message interface (`UpdateMessage`, `SnapshotMessage`, `ErrorMessage`,
`StreamInfo`, `MenuOption`, …) is exported as a type for code that handles raw
messages through `subscribe()`.

## Testing

`td-core` is tested against an in-memory TD rather than a live `.toe`, and the
same seams are open to you. Inject a `WebSocket` constructor and a `scheduler`
and the whole connection — handshake, backoff, heartbeat, throttle,
backpressure — runs deterministically with no real timers:

```ts
const conn = createTDConnection('ws://test', {
  WebSocket: MockWebSocket,
  scheduler: testScheduler,
});
```

`RTCPeerConnection` and `MediaStream` are injectable the same way on
`createTDVideoStream`. The fakes in the repo's `src/testing/` are a working
reference for what each one needs to implement.
