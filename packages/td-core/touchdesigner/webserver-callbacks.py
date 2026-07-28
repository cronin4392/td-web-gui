"""
webserverDAT callbacks — TD Web GUI control-data protocol.

Speaks the WebSocket wire contract the web app expects:

        hello             -> welcome
        snapshot-request  -> menus (if any) then snapshot (all exposed params)
        menus-request     -> menus   (re-read; the web's "reload devices" action)
        update            -> apply param writes
        pulse             -> fire a momentary param (par.pulse()), no reply
        ping              -> pong
        rtc-offer         -> drive the WebRTC DAT to answer (video)
        rtc-answer        -> apply the browser's answer to a TD-initiated offer
        rtc-ice           -> add a remote ICE candidate

Param-scoped failures reply with an `error` carrying the offending name as
`ref`, and are never fatal to the socket:

        unknown_param         no such name in the registry, or the wrong message
                              kind for it (an `update` aimed at a pulse param)
        missing_param         registered, but its operator/parameter isn't in this
                              project
        param_not_writable    registered writable:False, a backing par isn't in
                              CONSTANT mode (see _refuse_write), or the name is a
                              READOUTS entry, which is TD -> web only
        param_type_mismatch   the value doesn't fit the entry's declared wire type:
                              wrong JSON type, wrong array length, unknown menu key

Two maps feed the wire, sharing one namespace: REGISTRY (parameters, read AND
written, snapshot + broadcast) and READOUTS (values read straight out of a
CHOP or DAT, TD -> web only). Both land in the same `params` map on the wire,
so the browser binds either by name without knowing which is which. A name in
both is a config error: the REGISTRY entry wins (dropping it would silently
break writes) and the readout is ignored with a warning.

WebRTC signaling is multiplexed over this same socket. The outbound half
(answers, local ICE, the `streams` map) lives in webrtc-callbacks.py, which
reaches back here through send_signaling() since this module owns the client
sockets.

Nothing here is project specific — drop this into any project unchanged.
Everything project specific comes from the WebGuiServer component, reached by
its global OP shortcut:

        Identifier    names this instance to the web app.
        Config File   loaded into op.WebGuiServer.op('config'); its REGISTRY maps
                      friendly wire names to (operator, parameter, wire-type), and
                      its READOUTS maps them to CHOP channels and DAT cells. See
                      config-template.py.

TD-side changes are pushed back to the browser by generated watcher DATs, all
of them created by WebGuiServerExt from those two maps:

        Parameter Execute DAT -> broadcast_param_change()    parameter-execute.py
        CHOP Execute DAT      -> broadcast_channel_change()  chop-execute.py
        DAT Execute DAT       -> broadcast_table_change()    dat-execute.py

The two readout hooks only mark a name dirty; the actual `update` goes out
once at end of frame (see flush_readouts), since a CHOP Execute DAT fires per
changed SAMPLE and would otherwise send several messages per frame per channel.

See docs/protocol.md for the full message catalog.
"""

from typing import Any, Dict

import json

PROTOCOL = 1  # wire protocol version, sent in the `welcome` reply

clients = set()  # open WebSocket client connections, used for broadcast

# Live WebRTC peers, both directions — signaling must reach the one browser
# that owns a peer, and a closing socket must take its peer down with it.
peer_by_client = {}
client_by_peer = {}

# Cached Web Server DAT so broadcast_param_change() can send from outside a
# callback (e.g. a Parameter Execute DAT). Set on every callback that has `dat`.
_server = None

# Keys already warned about, so a project missing a backing operator/par/
# channel doesn't spam the textport on every request.
_warned = set()

# Readout names changed since the last flush, plus whether an end-of-frame
# flush is already booked. See flush_readouts.
_dirty_readouts = set()
_readout_flush_scheduled = False


def _webgui():
    """The WebGuiServer component, via its global OP shortcut."""
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "webserver-callbacks: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
        )
    return comp


def _config():
    """This project's config DAT module. Read fresh each time (not cached) so
    repointing Config File, or editing the file, takes effect immediately —
    TD caches the compiled module itself, so this only costs an op lookup."""
    dat = _webgui().op("config")
    if dat is None:
        raise RuntimeError(
            "webserver-callbacks: WebGuiServer has no 'config' DAT - "
            "check its Config File parameter"
        )
    return dat.module


def _registry():
    return _config().REGISTRY


def _readouts():
    # getattr rather than attribute access: READOUTS arrived after REGISTRY,
    # and a config written before it is still a valid params-only project.
    return getattr(_config(), "READOUTS", None) or {}


def _remember(dat):
    global _server
    _server = dat


def _warn_once(key, reason):
    """Print a warning the first time `key` produces one, then stay quiet —
    keyed rather than deduped on message, so a readout re-read every frame
    costs one line, not one per frame."""
    if key in _warned:
        return
    _warned.add(key)
    print("webserver-callbacks: warning - %s" % reason)


def _warn_missing(entry, reason):
    _warn_once((entry["op"], entry["par"]), reason)


def _pars(entry):
    """The backing par(s) for a registry entry, in wire order. Empty (not
    raising) when the operator/parameter isn't in this project, so callers can
    skip/warn instead of crashing the whole snapshot."""
    base = op(entry["op"])
    if base is None:
        hint = "" if entry["op"].startswith("/") else " - REGISTRY paths should be absolute"
        _warn_missing(entry, "operator '%s' not found%s" % (entry["op"], hint))
        return []
    if entry["type"] == "number[]":
        # The ParGroup, not a pars('Color*') name glob — the glob would also
        # sweep up unrelated pars sharing the prefix and order by parameter
        # list rather than by component. The ParGroup's own order IS the wire
        # array order.
        group = base.parGroup[entry["par"]]  # None when absent; .Name would raise
        if group is None:
            _warn_missing(entry, "operator '%s' has no ParGroup '%s'" % (entry["op"], entry["par"]))
            return []
        return list(group)
    par = getattr(base.par, entry["par"], None)
    if par is None:
        _warn_missing(entry, "operator '%s' has no par '%s'" % (entry["op"], entry["par"]))
        return []
    return [par]


def par_names(entry):
    """Names of the pars backing a registry entry. Public: WebGuiServerExt
    fills each generated Parameter Execute DAT's Parameters field from this,
    so it must agree with what this module broadcasts on — a 'number[]' entry
    expands to ParGroup component names ('Colorr', ...), not the registry
    name. Empty when the operator/par isn't in this project."""
    return [p.name for p in _pars(entry)]


# ── wire-type coercion ────────────────────────────────────────────────────────
#
# The wire speaks only clean JSON types — bool / number / string / number[] —
# and TD does all the coercion, since the registry is where the type
# information already lives.


class _WireTypeError(Exception):
    """A value doesn't fit the wire type its registry entry declares. Raised
    in both directions; never fatal — the caller turns it into a skipped
    snapshot entry (plus a warning) or a param-scoped `error` reply."""


def _to_number(value, where):
    # bool is an int subclass in Python but serialises as JSON `true`, so
    # letting one through would break the schema's promise of a number.
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    raise _WireTypeError("%s expected a number, got %r" % (where, value))


def _to_bool(value, where):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    # Not a plain bool(value): the string "false" is truthy.
    raise _WireTypeError("%s expected a boolean, got %r" % (where, value))


def _to_string(value, where):
    if isinstance(value, str):
        return value
    if hasattr(value, "path"):
        # OP-reference pars eval() to the operator itself, not a string.
        return value.path
    if isinstance(value, (int, float)):
        return str(value)
    raise _WireTypeError("%s expected a string, got %r" % (where, value))


def _read(name):
    """This param's current value, coerced to its declared wire type.
    par.eval() returns the live value in every ParMode, so an expression-
    driven, exported, or bound par reads correctly with no special handling."""
    entry = _registry()[name]
    pars = _pars(entry)
    where = "param '%s'" % name
    if entry["type"] == "number[]":
        return [_to_number(p.eval(), where) for p in pars]
    value = pars[0].eval()
    if entry["type"] == "bool":
        return _to_bool(value, where)
    if entry["type"] == "number":
        return _to_number(value, where)
    return _to_string(value, where)


# ── readouts (TD -> web only) ─────────────────────────────────────────────────
#
# A readout publishes a value with no parameter behind it — a CHOP channel, a
# DAT cell, a whole DAT table. It rides the same `params` map as REGISTRY.
# Nothing below ever writes: the web-facing refusal lives in _write/_pulse.

# Source kind, inferred from the entry's shape (the shapes are disjoint).
_CHANNEL = "channel"  # 'chan': 'level'
_CHANNELS = "channels"  # 'chan': ['low', 'mid', 'high']
_CELL = "cell"  # 'row' + 'col'
_TABLE = "table"  # neither — and so must declare type 'string[][]'

_READOUT_DEFAULT_TYPE = {
    _CHANNEL: "number",
    _CHANNELS: "number[]",
    _CELL: "string",
    _TABLE: "string[][]",
}

# A cell may not be declared 'bool': the string "false" is truthy, so there's
# no guess-free cast, and silently turning an off into an on is worse than refusing.
_READOUT_ALLOWED_TYPES = {
    _CHANNEL: ("number", "bool", "string"),
    _CHANNELS: ("number[]",),
    _CELL: ("string", "number"),
    _TABLE: ("string[][]",),
}

_READOUT_FAMILY = {
    _CHANNEL: "CHOP",
    _CHANNELS: "CHOP",
    _CELL: "DAT",
    _TABLE: "DAT",
}


def _readout_kind(entry):
    """Which source shape this entry describes — one of the constants above."""
    chan = entry.get("chan")
    if isinstance(chan, (list, tuple)):
        return _CHANNELS
    if chan is not None:
        return _CHANNEL
    if "row" in entry or "col" in entry:
        return _CELL
    return _TABLE


def _readout_type(name, entry, kind):
    """The wire type this readout promises, defaulted from its shape. Raises
    rather than falling back, so an unhonourable combination is skipped with
    one clear warning instead of sending a value the web schema can't handle."""
    declared = entry.get("type")
    if declared is None:
        if kind == _TABLE:
            raise _WireTypeError(
                "readout '%s' names only an operator - add 'chan', 'row'/'col', or "
                "'type': 'string[][]' to read the whole table" % name
            )
        return _READOUT_DEFAULT_TYPE[kind]
    allowed = _READOUT_ALLOWED_TYPES[kind]
    if declared not in allowed:
        raise _WireTypeError(
            "readout '%s' reads a %s, which can be %s - not %r"
            % (name, kind, " or ".join(repr(a) for a in allowed), declared)
        )
    return declared


def _readout_op(name, entry, kind):
    """The CHOP or DAT this readout reads. The family check earns its line: a
    'chan' entry pointed at a DAT would otherwise surface as a confusing
    missing-channel error rather than the wrong-operator mistake it is."""
    path = entry.get("op")
    base = op(path) if path else None
    if base is None:
        hint = "" if (path or "").startswith("/") else " - READOUTS paths should be absolute"
        raise _WireTypeError("readout '%s': operator '%s' not found%s" % (name, path, hint))
    family = _READOUT_FAMILY[kind]
    if base.family != family:
        raise _WireTypeError(
            "readout '%s': '%s' is a %s, but this entry reads a %s"
            % (name, path, base.family, family)
        )
    return base


def _cell_number(name, text):
    """A DAT cell's contents as a number. Parsed here rather than through
    _to_number (which refuses strings): a cell is a string BY NATURE, and
    declaring it 'number' is the author asking for this parse."""
    try:
        return float(text)
    except (TypeError, ValueError):
        raise _WireTypeError(
            "readout '%s' is declared 'number', but its cell holds %r" % (name, text)
        )


def _read_readout(name):
    """This readout's current value, coerced to its wire type. Every failure
    raises _WireTypeError, so callers skip the one name with a warning rather
    than losing the whole snapshot or frame's flush."""
    entry = _readouts()[name]
    kind = _readout_kind(entry)
    wire = _readout_type(name, entry, kind)
    base = _readout_op(name, entry, kind)
    where = "readout '%s'" % name

    if kind in (_CHANNEL, _CHANNELS):
        names = list(entry["chan"]) if kind == _CHANNELS else [entry["chan"]]
        values = []
        for chan_name in names:
            # chan() returns None for a miss instead of raising.
            channel = base.chan(chan_name)
            if channel is None:
                raise _WireTypeError(
                    "%s: '%s' has no channel '%s'" % (where, entry["op"], chan_name)
                )
            # eval() with no index is the value at the CURRENT time; [0] would
            # pin it to the buffer's first sample and never move on a
            # time-sliced CHOP.
            values.append(channel.eval())
        if kind == _CHANNELS:
            return [_to_number(v, where) for v in values]
        if wire == "bool":
            return _to_bool(values[0], where)
        if wire == "string":
            return _to_string(values[0], where)
        return _to_number(values[0], where)

    if kind == _CELL:
        if "row" not in entry or "col" not in entry:
            raise _WireTypeError("%s: a cell readout needs both 'row' and 'col'" % where)
        cell = base.cell(entry["row"], entry["col"])
        if cell is None:
            raise _WireTypeError(
                "%s: '%s' has no cell [%r, %r]" % (where, entry["op"], entry["row"], entry["col"])
            )
        # .val, not the bare Cell — a bare Cell autocasts to a number when its
        # contents look numeric, breaking the schema's promise of a string.
        text = cell.val
        return _cell_number(name, text) if wire == "number" else text

    # Whole table. str() per cell rather than trusting rows(val=True), since a
    # non-str slipping through would raise inside json.dumps and take down the
    # whole broadcast; tables change at human pace, so the pass is free.
    return [[str(cell) for cell in row] for row in base.rows(val=True)]


def _readout_names():
    """Readout names this project actually serves. A name in both REGISTRY
    and READOUTS is a config error; the parameter wins since dropping it would
    silently break writes."""
    registry = _registry()
    names = []
    for name in _readouts():
        if name in registry:
            _warn_once(
                ("collision", name),
                "'%s' is in both REGISTRY and READOUTS - the REGISTRY entry wins "
                "and the readout is ignored" % name,
            )
            continue
        names.append(name)
    return names


def readout_watches():
    """What READOUTS asks the generated watcher DATs to observe:
    `{op path: {'family': 'CHOP'|'DAT', 'chans': [channel names]}}` (`chans`
    empty for a DAT). Public: WebGuiServerExt builds the watchers from this,
    so this shape rule exists exactly once."""
    watches = {}
    for name in _readout_names():
        entry = _readouts()[name]
        path = entry.get("op")
        if not path:
            _warn_once(("readout", name), "readout '%s' has no 'op'" % name)
            continue
        kind = _readout_kind(entry)
        family = _READOUT_FAMILY[kind]
        watch = watches.setdefault(path, {"family": family, "chans": []})
        if watch["family"] != family:
            # One operator can't be both — whichever entry got here first
            # decides, and the other is skipped.
            _warn_once(
                ("family", path),
                "READOUTS entries disagree about whether '%s' is a CHOP or a DAT; "
                "watching it as a %s" % (path, watch["family"]),
            )
            continue
        if kind == _CHANNELS:
            chans = list(entry["chan"])
        elif kind == _CHANNEL:
            chans = [entry["chan"]]
        else:
            chans = []
        for chan in chans:
            if chan not in watch["chans"]:
                watch["chans"].append(chan)
    return watches


def _mark_readout_dirty(name):
    """Queue a readout for this frame's flush, booking the flush if needed."""
    global _readout_flush_scheduled
    if name in _registry():
        return  # shadowed by a param; _readout_names has already warned
    _dirty_readouts.add(name)
    if _readout_flush_scheduled:
        return
    dat = _webgui().op(_config().CALLBACKS)
    if dat is None:
        # Nothing to address the deferred call to; send inline instead of
        # dropping it.
        flush_readouts()
        return
    _readout_flush_scheduled = True
    # endFrame, not delayFrames=1: still reaches the browser in the frame it
    # changed, and every callback fired during this frame's cook coalesces.
    run("op(%r).module.flush_readouts()" % dat.path, endFrame=True)


def broadcast_channel_change(channel):
    """Queue every readout backed by this CHOP channel (CHOP Execute DAT
    hook). Called once per changed SAMPLE per channel, which is why this only
    marks and leaves the send to flush_readouts."""
    owner = channel.owner
    for name in _readout_names():
        entry = _readouts()[name]
        kind = _readout_kind(entry)
        if kind not in (_CHANNEL, _CHANNELS):
            continue
        # Compared by id: TD hands out fresh Python wrappers, so `is` is never safe.
        target = op(entry["op"])
        if target is None or target.id != owner.id:
            continue
        names = entry["chan"] if kind == _CHANNELS else [entry["chan"]]
        if channel.name in names:
            _mark_readout_dirty(name)


def broadcast_table_change(dat):
    """Queue every readout backed by this DAT (DAT Execute DAT hook). Both
    cell and whole-table readouts are queued, since the DAT Execute DAT
    reports the table changed, not which cell."""
    for name in _readout_names():
        entry = _readouts()[name]
        if _readout_kind(entry) in (_CHANNEL, _CHANNELS):
            continue
        target = op(entry["op"])
        if target is not None and target.id == dat.id:
            _mark_readout_dirty(name)


def flush_readouts():
    """Send everything dirtied this frame to every client, as ONE `update`.
    Public: the deferred run() in _mark_readout_dirty names it.

    A CHOP Execute DAT can fire several times per frame per channel, so an
    inline broadcast would flood the socket; coalescing here caps it at one
    message per frame. Re-reading at flush time (rather than carrying each
    callback's `val`) is what makes that correct — the value sent is the one
    that survived the frame.
    """
    global _readout_flush_scheduled
    _readout_flush_scheduled = False
    names = sorted(_dirty_readouts)
    _dirty_readouts.clear()
    if not names or not clients:
        return
    # Re-checked against the config rather than trusted from the mark, since
    # the config DAT syncs to file and can change between mark and flush.
    serveable = set(_readout_names())
    params = {}
    for name in names:
        if name not in serveable:
            continue
        try:
            params[name] = _read_readout(name)
        except _WireTypeError as e:
            _warn_once(("readout", name), str(e))
    if params:
        _broadcast({"type": "update", "params": params})


def _snapshot():
    # Pulses hold no state, so never part of a snapshot/update. A registered
    # par whose op/par doesn't exist is left out rather than sent as null —
    # the browser drops unknown names anyway.
    result = {}
    for name, entry in _registry().items():
        if entry["type"] == "pulse":
            continue
        if not _pars(entry):
            continue
        try:
            result[name] = _read(name)
        except _WireTypeError as e:
            _warn_missing(entry, str(e))
    # Readouts join the same map — a snapshot is the only way a newly
    # connected browser learns a readout that hasn't changed since it opened.
    for name in _readout_names():
        try:
            result[name] = _read_readout(name)
        except _WireTypeError as e:
            _warn_once(("readout", name), str(e))
    return result


def _menus():
    """Menu options for every registry entry whose backing par is a Menu:
    `{name: [{'value': key, 'label': label}]}`.

    This is the one place TD is introspected on the web's behalf — for menus
    the web *cannot* author ahead of time, e.g. an Audio Device Out CHOP's
    device list, which depends on the machine and changes when hardware is
    plugged in. No registry field marks these; a par either has menuNames or
    it doesn't. Restricted to 'string' entries because Toggle pars also carry
    menuNames (['off','on']) while travelling the wire as bools.
    """
    result = {}
    for name, entry in _registry().items():
        if entry["type"] != "string":
            continue
        pars = _pars(entry)
        if not pars:
            continue
        keys = getattr(pars[0], "menuNames", None)
        if not keys:
            continue
        labels = getattr(pars[0], "menuLabels", None) or keys
        result[name] = [{"value": k, "label": l} for k, l in zip(keys, labels)]
    return result


_last_menus = None  # last announced menu map, so broadcasts only fire on real change


def broadcast_menus_if_changed():
    """Re-announce menus to every client, but only when they've actually
    changed. Returns True if a broadcast went out.

    TD has no event for a menu's *contents* changing — a Parameter Execute
    DAT fires on value/mode/enable/export, but plugging in an audio interface
    changes none of those. So there is nothing to subscribe to.

    Do NOT reach for a Parameter DAT (Menu Names / Menu Labels output) plus a
    DAT Execute to get an event out of this — measured on 2025.33070,
    changing a par's menuNames fires onTableChange ZERO times, while changing
    that par's *value* fires it once. Derivative logged this as a bug in
    April 2021 (forum.derivative.ca/t/breaking-binding-a-dropdown-menu-out-to-
    a-perform-ui/13123), still open.

    Three ways to trigger a re-check instead:
    1. **A `menus-request` from the browser** ("reload devices" button) — cheap
       and predictable, since the person who plugged the device in is right there.
    2. **An optional TD-side poll**, for menus that must refresh with nobody
       watching. Not wired up by default: costs a menuNames read per
       registered menu par per tick, forever.

               def onFrameStart(frame):
                       if absTime.frame % 120:   # ~2s at 60fps
                               return
                       op.WebGuiServer.op('webserver1_callbacks').module.broadcast_menus_if_changed()

    3. **Best when it applies: the pulse that causes the change** — if a menu
       is rebuilt by a TD action (a Screen Grab TOP's Refresh Sources), hook
       that pulse's onPulse and call this. Audio devices don't qualify since
       the OS changes that list, not a par.
    """
    global _last_menus
    menus = _menus()
    if menus == _last_menus:
        return False
    _last_menus = menus
    _broadcast({"type": "menus", "menus": menus})
    return True


def _send(client, message):
    if _server is not None:
        _server.webSocketSendText(client, json.dumps(message))


def _broadcast(message):
    if _server is None:
        return
    text = json.dumps(message)
    for client in list(clients):
        _server.webSocketSendText(client, text)


def _report(client, name, problem):
    """Send back a param-scoped `error` if a write/pulse refused, else
    nothing. `ref` is what lets the browser recover this one param."""
    if problem is None:
        return
    code, detail = problem
    _send(client, {"type": "error", "code": code, "message": detail, "ref": name})


# ── WebRTC signaling ──────────────────────────────────────────────────────────


def _webrtc():
    """The project's WebRTC DAT, as `(dat, problem)`. `problem` distinguishes
    "video not configured" from "WEBRTC names an operator that isn't there" —
    those need opposite fixes."""
    name = getattr(_config(), "WEBRTC", None)
    if not name:
        return None, "this project exposes no video - set WEBRTC in the config DAT"
    dat = op(name)
    if dat is None:
        hint = (
            ""
            if name.startswith("/")
            else " - a bare name resolves inside WebGuiServer; use an absolute path if it lives elsewhere"
        )
        return None, "config WEBRTC names '%s', which doesn't exist%s" % (name, hint)
    return dat, None


def _streams():
    return getattr(_config(), "STREAMS", {})


def _set_par(owner, name, value):
    """Set `owner.par.<name>`, printing the operator's type and full parameter
    list on a miss — otherwise a missing par fails silently and surfaces much
    later as a peer that negotiates but carries no video."""
    if hasattr(owner.par, name):
        setattr(owner.par, name, value)
        return True
    print(
        "webserver-callbacks: warning - %s (%s) has no par '%s'\n  its pars are: %s"
        % (owner.path, owner.OPType, name, sorted(p.name for p in owner.pars("*")))
    )
    return False


def _add_tracks(webrtc, connection):
    """Declare a video track per configured stream, before answering — the
    docs are explicit that addTrack must precede createOffer/createAnswer.
    Skip it and the answer still negotiates, but its video m-line comes back
    `a=inactive`: a live-but-muted receiver, connected, with no error either side."""
    for stream_id in _streams():
        if not webrtc.addTrack(connection, stream_id, "video"):
            print(
                "webserver-callbacks: warning - addTrack failed for '%s' on %s"
                % (stream_id, connection)
            )


def _stream_top(stream_id):
    """The Video Stream Out TOP carrying `stream_id`, generated inside
    WebGuiServer by WebGuiServerExt. None when the extension hasn't run."""
    getter = getattr(_webgui(), "StreamTop", None)
    return getter(stream_id) if getter is not None else None


def attach_streams(connection):
    """Point every generated Video Stream Out TOP at this peer's track.
    Public: the deferred `run()` below names it.

    Deferred by a frame: the TOP's WebRTC parameters are *menus* populated
    from the DAT (setting `webrtc` fills the connection menu, setting
    `webrtcconnection` fills the track menu), so they can't be selected until
    the DAT has cooked. This only governs which TOP feeds pixels; the SDP was
    already settled by _add_tracks.

    One TOP carries one connection, so a second browser re-points the same
    TOP and takes the stream from the first — single-viewer is the v1
    assumption (see docs/touchdesigner-setup.md § Video); _handle_rtc_offer
    warns about it.
    """
    webrtc, _ = _webrtc()
    if webrtc is None or connection not in client_by_peer:
        return  # browser went away during the wait

    for stream_id in _streams():
        top = _stream_top(stream_id)
        if top is None:
            print(
                "webserver-callbacks: warning - no generated Video Stream Out TOP "
                "for stream '%s'; call op.WebGuiServer.Rebuild()" % stream_id
            )
            continue
        # Lowercase: built-in pars (custom pars are Capitalized, see REGISTRY).
        _set_par(top, "webrtc", webrtc)
        _set_par(top, "webrtcconnection", connection)
        _set_par(top, "webrtcvideotrack", stream_id)  # audio out of scope for v1


def _attach_streams_next_frame(connection):
    # run() executes detached from this module, so the callbacks DAT is
    # addressed by absolute path rather than the config's bare name.
    dat = op(_config().CALLBACKS)
    if dat is None:
        attach_streams(connection)  # no way to defer; try it inline
        return
    run("op(%r).module.attach_streams(%r)" % (dat.path, connection), delayFrames=1)


def _close_peer(client):
    connection = peer_by_client.pop(client, None)
    if connection is None:
        return
    client_by_peer.pop(connection, None)
    webrtc, _ = _webrtc()
    if webrtc is not None:
        webrtc.closeConnection(connection)  # otherwise a peer/encoder leaks per refresh


def send_signaling(connection, message):
    """Send one signaling message to the browser owning `connection`. Called
    by webrtc-callbacks.py, which has the SDP/ICE but not the sockets."""
    client = client_by_peer.get(connection)
    if client is not None:
        _send(client, message)


def _handle_rtc_offer(client, sdp):
    """Answer a browser's offer — the normal path, since the browser offers
    on connect and on rebuild. A rebuild arrives as a fresh offer on the same
    socket, so any previous peer for this client is torn down first."""
    webrtc, problem = _webrtc()
    if webrtc is None:
        _send(client, {"type": "error", "code": "video_unavailable", "message": problem})
        print("webserver-callbacks: %s" % problem)
        return
    if not _streams():
        print(
            "webserver-callbacks: warning - WEBRTC is set but STREAMS is empty, "
            "so the peer will carry no video"
        )

    # Single-viewer is a limit of the TOPs, not the peer: each Video Stream
    # Out TOP holds ONE connection, so attach_streams re-points this
    # project's TOPs at whoever negotiated last and the earlier browser's
    # tiles freeze — newest-wins, with no error shown to the victim.
    others = [c for c in peer_by_client if c != client]
    if others:
        print(
            "webserver-callbacks: warning - %d other browser(s) already hold a "
            "video peer; one Video Stream Out TOP serves one connection, so "
            "this one takes the stream and theirs freezes. Serving both needs a "
            "second set of TOPs." % len(others)
        )
        _send(
            client,
            {
                "type": "error",
                "code": "video_single_viewer",
                "message": "another browser was streaming; video moved to "
                "this one and its tiles have frozen",
            },
        )

    _close_peer(client)
    connection = webrtc.openConnection()
    peer_by_client[client] = connection
    client_by_peer[connection] = client

    # Order is load-bearing: tracks must exist before the answer is built, or
    # the video m-line comes back `a=inactive`.
    _add_tracks(webrtc, connection)
    webrtc.setRemoteDescription(connection, "offer", sdp)
    webrtc.createAnswer(connection)
    _attach_streams_next_frame(connection)


def _handle_rtc_answer(client, sdp):
    """Apply the browser's answer to an offer TD initiated (a track change)."""
    webrtc, _ = _webrtc()
    connection = peer_by_client.get(client)
    if webrtc is None or connection is None:
        return
    webrtc.setRemoteDescription(connection, "answer", sdp)


def _handle_rtc_ice(client, message):
    """Add a remote ICE candidate. `candidate: null` is end-of-candidates and
    is dropped rather than forwarded — TD finishes checking on its own."""
    webrtc, _ = _webrtc()
    connection = peer_by_client.get(client)
    candidate = message.get("candidate")
    if webrtc is None or connection is None or not candidate:
        return
    webrtc.addIceCandidate(  # argument order is the DAT's: candidate, line index, mid
        connection, candidate, message.get("sdpMLineIndex"), message.get("sdpMid")
    )


def _refuse_write(name, entry, pars):
    """Why a web write must not touch these pars, or None when it may.

    Two independent gates: the registry author marked `writable: False`, or
    any backing par isn't in CONSTANT mode. The second matters more than "the
    write wouldn't take anyway" — on 2025.33070, assigning par.val to an
    EXPRESSION- or EXPORT-mode par **flips it into CONSTANT mode** and the
    expression stops driving it for good (the text survives in par.expr, but
    nothing evaluates it). So an unguarded write doesn't fail quietly; it
    detaches a TD author's expression permanently.

    BIND is refused alongside them even though a two-way bind was observed to
    propagate the write to its master rather than break — it can't be assumed
    writable either, and refusing is the recoverable direction.

    Checked per component for arrays, so a half-constant ParGroup is refused
    whole rather than half-applied.
    """
    if not entry.get("writable", True):
        return "param '%s' is registered writable:False" % name
    stuck = [p for p in pars if p.mode != ParMode.CONSTANT]
    if stuck:
        return "param '%s' is not web-writable: %s" % (
            name,
            ", ".join("%s is in %s mode" % (p.name, p.mode.name) for p in stuck),
        )
    return None


def _menu_checked(par, value, where):
    """Reject a menu key TD doesn't have, rather than let it silently snap to
    entry 0. <Select>'s options are authored on the web side (TD is never
    introspected), so drift between them and TD's menu is expected, not a freak case."""
    names = getattr(par, "menuNames", None)
    if names and value not in names:
        offered = ", ".join(names[:12]) + (", ..." if len(names) > 12 else "")
        raise _WireTypeError("%s has no menu key '%s' - TD offers: %s" % (where, value, offered))
    return value


def _coerce_in(name, entry, pars, value):
    """A wire value as the list of values to assign, one per backing par."""
    where = "param '%s'" % name
    if entry["type"] == "number[]":
        if not isinstance(value, (list, tuple)):
            raise _WireTypeError(
                "%s expected an array of %d numbers, got %r" % (where, len(pars), value)
            )
        if len(value) != len(pars):
            # zip() would truncate here, half-applying a colour or an XYZ
            # with no trace of why.
            raise _WireTypeError(
                "%s expects %d components (%s), got %d"
                % (where, len(pars), ", ".join(p.name for p in pars), len(value))
            )
        return [_to_number(v, where) for v in value]
    if entry["type"] == "bool":
        return [_to_bool(value, where)]
    if entry["type"] == "number":
        return [_to_number(value, where)]
    return [_menu_checked(pars[0], _to_string(value, where), where)]


def _write(name, value):
    """Apply a wire value to its backing parameter(s). Returns None on
    success, or an (error code, message) pair."""
    entry = _registry().get(name)
    if entry is None:
        if name in _readouts():
            # param_not_writable (not unknown_param) is what triggers the
            # web's safety net: it marks the name read-only and re-requests a
            # snapshot, so the optimistic edit snaps back.
            return (
                "param_not_writable",
                "'%s' is a readout (READOUTS), which is TD -> web only" % name,
            )
        return "unknown_param", "no param '%s'" % name
    if entry["type"] == "pulse":
        return "unknown_param", "'%s' is pulse-only, send a pulse message" % name
    pars = _pars(entry)
    if not pars:
        return "missing_param", "param '%s' has no backing operator" % name
    refusal = _refuse_write(name, entry, pars)
    if refusal is not None:
        return "param_not_writable", refusal
    try:
        values = _coerce_in(name, entry, pars, value)
    except _WireTypeError as e:
        return "param_type_mismatch", str(e)
    # Every component is coerced before any is assigned, so a bad third
    # component can't leave the first two already written.
    for par, coerced in zip(pars, values):
        par.val = coerced
    return None


def _pulse(name):
    """Fire a momentary parameter (web -> TD only, no synced state). Returns
    None on success, or an (error code, message) pair.

    No mode guard here, unlike _write: par.pulse() leaves the mode alone
    (checked on 2025.33070), so it can't detach an expression the way
    par.val does. The registry's writable flag is still honoured.
    """
    entry = _registry().get(name)
    if entry is None and name in _readouts():
        return (
            "param_not_writable",
            "'%s' is a readout (READOUTS), which is TD -> web only" % name,
        )
    if entry is None or entry["type"] != "pulse":
        return "unknown_param", "no pulse param '%s'" % name
    if not entry.get("writable", True):
        return "param_not_writable", "param '%s' is registered writable:False" % name
    pars = _pars(entry)
    if not pars:
        return "missing_param", "param '%s' has no backing operator" % name
    pars[0].pulse()
    return None


def broadcast_param_change(par):
    """Push a single TD-side parameter change to all connected browsers.

    Call from a Parameter Execute DAT watching the backing operators. Edits
    from the web also flow through here, since onWebSocketReceiveText sets
    par.val, firing the Parameter Execute DAT — one uniform broadcast path.
    The originating browser ignores its own echo while the input is focused.
    """
    owner = par.owner
    for name, entry in _registry().items():
        if entry["type"] == "pulse":
            continue
        # Compared by id: TD hands out fresh Python wrapper objects (`p is p`
        # is always False for Par), so identity isn't a safe comparison.
        target = op(entry["op"])
        if target is None or target.id != owner.id:
            continue
        # Matched against the group's actual components, not a name prefix —
        # a 'Colormode' par must not be mistaken for a 'Color' component.
        matches = (
            any(p.name == par.name for p in _pars(entry))
            if entry["type"] == "number[]"
            else par.name == entry["par"]
        )
        if matches:
            try:
                value = _read(name)
            except _WireTypeError as e:
                _warn_missing(entry, str(e))
                return
            _broadcast({"type": "update", "params": {name: value}})
            return


def onHTTPRequest(
    dat: webserverDAT, request: Dict[str, Any], response: Dict[str, Any]
) -> Dict[str, Any]:
    response["statusCode"] = 200
    response["statusReason"] = "OK"
    response["data"] = "<b>TouchDesigner: </b>" + dat.name
    return response


def onWebSocketOpen(dat: webserverDAT, client: str, uri: str):
    _remember(dat)
    clients.add(client)
    return


def onWebSocketClose(dat: webserverDAT, client: str):
    clients.discard(client)
    _close_peer(client)
    return


def onWebSocketReceiveText(dat: webserverDAT, client: str, data: str):
    _remember(dat)
    # Re-registered on every message, not just onWebSocketOpen: re-cooking
    # this DAT (an edit, or a Sync to File reload) rebuilds the module and
    # empties `clients` while the sockets stay open. The heartbeat ping
    # restores the set within one interval.
    clients.add(client)

    try:
        message = json.loads(data)
    except Exception:
        return  # malformed frame: drop it, keep the socket up

    mtype = message.get("type")

    if mtype == "hello":
        _send(
            client,
            {"type": "welcome", "protocol": PROTOCOL, "instance": _webgui().par.Identifier.eval()},
        )

    elif mtype == "snapshot-request":
        # Menus first, then values — a <Select> that received its value
        # before its options would briefly render as though TD selected nothing.
        menus = _menus()
        if menus:
            _send(client, {"type": "menus", "menus": menus})
        _send(client, {"type": "snapshot", "params": _snapshot()})

    elif mtype == "update":
        for name, value in (message.get("params") or {}).items():
            # A successful _write fires the Parameter Execute DAT, which
            # broadcasts the change on to every client.
            _report(client, name, _write(name, value))

    elif mtype == "pulse":
        name = message.get("name")
        _report(client, name, _pulse(name))

    elif mtype == "menus-request":
        # "Reload devices" button: re-reads and broadcasts to every client if
        # menus really changed, otherwise answers the requester directly —
        # either way exactly one reply.
        if not broadcast_menus_if_changed():
            _send(client, {"type": "menus", "menus": _menus()})

    elif mtype == "ping":
        _send(client, {"type": "pong"})

    elif mtype == "rtc-offer":
        _handle_rtc_offer(client, message.get("sdp"))

    elif mtype == "rtc-answer":
        _handle_rtc_answer(client, message.get("sdp"))

    elif mtype == "rtc-ice":
        _handle_rtc_ice(client, message)

    # Unknown types ignored, so a newer web client can add messages without
    # breaking an older project.
    return


def onWebSocketReceiveBinary(dat: webserverDAT, client: str, data: bytes):
    return  # binary frames are unused in v1


def onWebSocketReceivePing(dat: webserverDAT, client: str, data: bytes):
    dat.webSocketSendPong(client, data=data)
    return


def onWebSocketReceivePong(dat: webserverDAT, client: str, data: bytes):
    return


def onServerStart(dat: webserverDAT):
    _remember(dat)
    clients.clear()
    return


def onServerStop(dat: webserverDAT):
    clients.clear()
    return
