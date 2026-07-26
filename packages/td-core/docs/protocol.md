# Wire protocol

The contract between the browser and TouchDesigner. You don't need this to *use*
`td-core` — the bundled DAT callbacks already speak it. Read it if you're
implementing the TD side yourself, debugging frames in devtools, or extending the
protocol.

**Protocol version 1.**

- [Shape](#shape)
- [Transport](#transport)
- [Handshake](#handshake)
- [Message catalog](#message-catalog)
- [Value types](#value-types)
- [Errors](#errors)
- [Forward compatibility](#forward-compatibility)
- [Keeping the two sides in sync](#keeping-the-two-sides-in-sync)

## Shape

Every message is a JSON object with a `type` field discriminating a typed
payload:

```jsonc
{ "type": "update", "params": { "intensity": 0.5 } }
```

Keys are readable (`type`, `params`, `name`, `value`) rather than terse. Payloads
are small and capped around 60fps, so debuggability wins over bytes.

## Transport

One WebSocket per TD instance, served by that instance's Web Server DAT.
**WebRTC signaling is multiplexed over the same socket** — one connection to
manage, no second port, no extra TD component.

The socket is plain `ws://` on loopback. See
[design-notes.md § Security model](design-notes.md#security-model).

## Handshake

Runs on open and again on every reconnect:

```
web                              TD
 │  { "type": "hello", "protocol": 1 }
 │ ─────────────────────────────────────►
 │                    { "type": "welcome", "protocol": 1, "instance": "mixer" }
 │ ◄─────────────────────────────────────
 │  { "type": "snapshot-request" }
 │ ─────────────────────────────────────►
 │                    { "type": "menus", "menus": {…} }        (if any)
 │                    { "type": "snapshot", "params": {…} }
 │ ◄─────────────────────────────────────
```

`status()` flips to `synced` once the snapshot applies.

**No ordering race, by construction.** A single WebSocket delivers in FIFO order,
and TD generates the snapshot *after* receiving `snapshot-request` — so the
snapshot already reflects every update sent before it, and anything sent
afterward arrives after it. The web applies messages in arrival order: snapshot
as authoritative baseline, live updates on top. No buffering, no reordering.

**Menus precede the snapshot** so a `<Select>` never briefly holds a value with
no option matching it.

**Version mismatch warns rather than rejects.** `protocol` is a single integer,
bumped only on breaking changes. Web and TD project are versioned together, so a
mismatch is a deploy mistake — and bricking the UI over one helps nobody on a
closed system. The web logs a prominent warning and proceeds best-effort.

## Message catalog

### web → TD

| Message | Payload |
|---|---|
| `hello` | `{ protocol: number }` |
| `snapshot-request` | — |
| `menus-request` | — |
| `update` | `{ params: { [name]: value } }` |
| `pulse` | `{ name: string }` |
| `ping` | — |
| `rtc-offer` | `{ sdp: string }` |
| `rtc-answer` | `{ sdp: string }` |
| `rtc-ice` | `{ candidate: string \| null, sdpMid?, sdpMLineIndex? }` |

### TD → web

| Message | Payload |
|---|---|
| `welcome` | `{ protocol: number, instance?: string }` |
| `snapshot` | `{ params: { [name]: value } }` |
| `update` | `{ params: { [name]: value } }` |
| `menus` | `{ menus: { [name]: { value, label }[] } }` |
| `pong` | — |
| `error` | `{ code: string, message?: string, ref?: string }` |
| `streams` | `{ streams: { id, mid, label? }[] }` |
| `rtc-offer` / `rtc-answer` / `rtc-ice` | as above |

```jsonc
{ "type": "update",   "params": { "intensity": 0.5, "color": [1, 0, 0, 1], "enabled": true } }
{ "type": "pulse",    "name": "reset" }
{ "type": "menus",    "menus": { "audiodevice": [{ "value": "default", "label": "Default" }] } }
{ "type": "streams",  "streams": [{ "id": "main", "mid": "0", "label": "Render A" }] }
{ "type": "error",    "code": "param_not_writable", "message": "…", "ref": "fps" }
{ "type": "rtc-ice",  "candidate": "candidate:…", "sdpMid": "0", "sdpMLineIndex": 0 }
```

### Notes on individual messages

**`update` covers single and batch.** It always carries a `params` map; one
change is a one-entry map. The outbound throttle coalesces a frame's changes into
one message for free, and the shape is symmetric in both directions. Toggles
(bool), menus (string key), and colors (array) all ride it — only the components
differ.

**Parameters are a broadcast bus.** TD sends every exposed parameter change to
every connected client; there is no per-client subscription. The web ignores
names it isn't bound to (a routing-table miss, dropped with no allocation). The
web UI is not assumed to be the only consumer.

**`pulse` is web → TD only.** A momentary parameter has no persisted value, so
modeling it as an `update` would be wrong — nothing to snapshot, nothing to echo.
TD calls `par.pulse()`. Pulses are excluded from snapshots and from the focus/echo
rules, and are never throttled: a pulse is a discrete event, not a sampled value,
so buffering it a frame would risk coalescing distinct presses.

**`ping`/`pong` is application-level.** Browser JS can't observe the WebSocket
protocol's own ping/pong frames, so liveness of an established session is probed
explicitly. A missing `pong` marks the socket half-open.

**`rtc-ice` carries the full descriptor** — `{ candidate, sdpMid,
sdpMLineIndex }`, exactly what `addIceCandidate()` needs. A bare candidate string
can't be applied without its m-line association. **`candidate: null` is
end-of-candidates**, forwarded as `addIceCandidate(null)`, which keeps trickle ICE
symmetric regardless of which side offered.

**`streams` is re-sent on every renegotiation.** A renegotiation can shift track
`mid`s, which is exactly why the `id` → `mid` mapping is explicit rather than
assuming a fixed track order.

**Signaling messages appear in both directions.** The browser offers on connect
and on rebuild; TD offers for its own renegotiations, because only an offerer can
add m-lines. Both sides must be able to send and receive an offer.

## Value types

The wire speaks only **clean JSON types** — `bool`, `number`, `string`,
`number[]` — and **TouchDesigner does all coercion**, because the registry is
where parameter-type information already lives. The web's TypeScript schema lines
up 1:1 with the wire and never has to know that a TD Toggle is really a 0/1 float
or that a color is four separate pars.

| Wire type | TD → web (read) | web → TD (write) |
|---|---|---|
| `bool` | `bool(par.eval())` | `par.val = v` |
| `number` | `par.eval()` | `par.val = v` |
| `string` | `par.eval()` | `par.val = v` |
| `number[]` | `[p.eval() for p in parGroup]` | each component in order |

**Menus carry the string key, not the index.** `par.eval()` on a Menu par returns
the key, which survives TD-side menu reordering where an index wouldn't.

**Arrays map to a ParGroup.** A color or XYZ value is several component pars, so
an array registry entry names the ParGroup — and the group's fixed component
order *is* the array order on the wire. Not a `pars('Color*')` name glob, which
would sweep up an unrelated `Colormode` sitting beside `Colorr/g/b/a` and order by
the operator's parameter list rather than by component.

**Int vs float is TD's job.** JSON has one numeric type; `number` covers both.
The registry already knows which the backing par is, so `par.val = v` lets TD
round on write while `par.eval()` returns its native type on read.

## Errors

An `error` is **surfaced, never fatal**. It routes to the connection's
`lastError` signal and `onError` handler; the socket stays up.

| Code | `ref` | Meaning |
|---|---|---|
| `unknown_param` | yes | No such name in the registry, or the wrong message kind for it (an `update` aimed at a pulse param). |
| `missing_param` | yes | Registered, but its operator or parameter isn't in this project. |
| `param_not_writable` | yes | Registered `writable: False`, or a backing par isn't in `CONSTANT` mode. |
| `param_type_mismatch` | yes | Value doesn't fit the declared wire type: wrong JSON type, wrong array length, unknown menu key. |
| `video_unavailable` | no | Signaling arrived but the project exposes no video, or `WEBRTC` names a missing operator. |
| `video_single_viewer` | no | Another browser was streaming; video moved here and its tiles froze. |

**`ref` is what makes recovery possible.** A param-scoped error carries the
offending name, so handlers can act on that one parameter — `td-core` keys its
read-only marking and re-snapshot on it. A connection-scoped error has no `ref`
and triggers no per-param action; there's nothing to revert. Recovery code should
test `if (err.ref)` rather than assume it's present.

Unknown codes are accepted and surfaced, so TD can add error codes without a web
change.

## Forward compatibility

Three rules keep older clients working against newer projects and vice versa:

**Unknown message types are dropped, not errors.** `parse()` returns `null` for
an unrecognized `type`, the connection logs it at debug level and processes the
next message. TD's callbacks likewise ignore message types they don't know.

**Malformed JSON is caught and dropped.** A parse failure never tears down the
socket.

**Unknown parameter names in an `update` are ignored.** Consistent with the
broadcast-bus model — the web skips names it isn't bound to, no error raised.

So: add a message type, and old clients ignore it. Add a parameter, and old
clients don't see it. Only a change to the *meaning* of an existing field needs
a `PROTOCOL_VERSION` bump.

## Keeping the two sides in sync

Two hand-authored declarations describe the same parameters, and **nothing checks
that they agree**:

| Side | File | Declares |
|---|---|---|
| TouchDesigner | your config's `REGISTRY` | name → operator, parameter, wire type |
| Web | your `Schema` interface | name → TypeScript type |

This duplication is deliberate. The alternative — the web introspecting TD's
network — would couple your UI to TD's node layout and make the whole app depend
on a live connection to type-check. Authoring both sides is the same accepted
cost as any client/server schema.

Practical consequences:

- **A name in one and not the other fails quietly in a specific way.** A web-only
  name gets `unknown_param` on write and never receives a value. A TD-only name
  is broadcast and silently dropped by the web.
- **A type mismatch is caught by TD, not by TypeScript.** Sending a string for a
  `number` entry returns `param_type_mismatch` at runtime.
- **`<Select options>` drifting from TD's menu** returns `param_type_mismatch`
  with the keys TD actually offers. Without that check an unrecognized key would
  silently select TD's *first* menu entry — and the Parameter Execute DAT would
  then broadcast that back as though the user had picked it.

The one exception where TD *is* introspected is menu options, for menus the web
cannot author ahead of time. See
[design-notes.md § TD-announced menus](design-notes.md#td-announced-menus).
