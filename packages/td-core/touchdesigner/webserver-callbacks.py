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

Two maps feed the wire, and they share one namespace:

        REGISTRY    parameters, read AND written, snapshot + broadcast
        READOUTS    values read straight out of a CHOP or DAT, TD -> web only

Both land in the same `params` map on the wire, so the browser binds either by
name without knowing which is which — where a value lives in TD is a TD detail.
A name in both is a config error: the REGISTRY entry wins (it is the
bidirectional contract, so dropping it would silently break writes) and the
readout is ignored with a warning.

WebRTC signaling is multiplexed over this same socket — one connection to
manage, no second port. The outbound half (answers, local ICE, the `streams`
map) lives in webrtc-callbacks.py, which reaches back here through
send_signaling() because this module is the one that owns the client sockets.

Nothing here is project specific — drop this into any project unchanged.
Everything project specific comes from the WebGuiServer component, reached by
its global OP shortcut:

        Identifier    names this instance to the web app.
        Config File   loaded into op.WebGuiServer.op('config'); its REGISTRY maps
                      friendly wire names to (operator, parameter, wire-type), the
                      single place type info lives, and its READOUTS maps them to
                      CHOP channels and DAT cells. See config-template.py.

TD-side changes are pushed back to the browser by generated watcher DATs, all of
them created by WebGuiServerExt from those two maps:

        Parameter Execute DAT -> broadcast_param_change()    parameter-execute.py
        CHOP Execute DAT      -> broadcast_channel_change()  chop-execute.py
        DAT Execute DAT       -> broadcast_table_change()    dat-execute.py

The two readout hooks only mark a name dirty; the actual `update` goes out once
at end of frame (see flush_readouts), because a CHOP Execute DAT fires per
changed SAMPLE and would otherwise send several messages per frame per channel.

See docs/protocol.md for the full message catalog.
"""

from typing import Any, Dict

import json

# Wire protocol version, sent in the `welcome` reply.
PROTOCOL = 1

# Open WebSocket client connections, used for broadcast.
clients = set()

# Live WebRTC peers, both directions. Signaling has to reach the one browser
# that owns a peer rather than every client, and a closing socket has to take its
# peer down with it, so the mapping is kept both ways.
peer_by_client = {}
client_by_peer = {}

# Cached Web Server DAT so broadcast_param_change() can send from outside a
# callback (e.g. a Parameter Execute DAT). Set on every callback that has `dat`.
_server = None

# Keys we've already warned about, so a project that's missing a backing
# operator/par/channel doesn't spam the textport on every request — and readouts
# especially, since those are re-read every frame they change.
_warned = set()

# Readout names changed since the last flush, plus whether an end-of-frame flush
# is already booked. See flush_readouts.
_dirty_readouts = set()
_readout_flush_scheduled = False


def _webgui():
    """The WebGuiServer component, via its global OP shortcut.

    A shortcut rather than a path, so this file resolves it wherever it's dropped.
    """
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "webserver-callbacks: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
        )
    return comp


def _config():
    """This project's config DAT module, loaded from WebGuiServer's Config File par.

    Read fresh each time rather than cached, so repointing Config File (or editing
    the file) takes effect without re-cooking this DAT — TD caches the compiled
    module itself, so this costs an op lookup.
    """
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
    """The config's READOUTS map, or {} for a project that declares none.

    getattr rather than attribute access: READOUTS arrived after REGISTRY, and a
    config written before it is still a perfectly valid params-only project.
    """
    return getattr(_config(), "READOUTS", None) or {}


def _remember(dat):
    global _server
    _server = dat


def _warn_once(key, reason):
    """Print a warning the first time `key` produces one, then stay quiet.

    Keyed rather than deduped on the message so a value that keeps failing (a
    readout re-read every frame) costs one line, not one per frame.
    """
    if key in _warned:
        return
    _warned.add(key)
    print("webserver-callbacks: warning - %s" % reason)


def _warn_missing(entry, reason):
    _warn_once((entry["op"], entry["par"]), reason)


def _pars(entry):
    """The backing par(s) for a registry entry, in wire order.

    Empty when that operator/parameter isn't in this project (rather than
    raising), so callers can skip/warn instead of crashing the whole snapshot.
    """
    base = op(entry["op"])
    if base is None:
        # A bare name is the likely culprit: this runs inside WebGuiServer, so
        # relative lookups resolve against the component, not the project root.
        hint = "" if entry["op"].startswith("/") else " - REGISTRY paths should be absolute"
        _warn_missing(entry, "operator '%s' not found%s" % (entry["op"], hint))
        return []
    if entry["type"] == "number[]":
        # The ParGroup, not a pars('Color*') name glob. The glob was wrong twice
        # over: it also sweeps up unrelated pars that merely share the prefix (a
        # 'Colormode' sitting beside 'Colorr/g/b/a'), and it orders by the
        # operator's parameter list rather than by component. A ParGroup's own
        # order IS the fixed component order the wire array uses.
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
    """The names of the pars backing a registry entry.

    Public because WebGuiServerExt needs it to fill each generated Parameter
    Execute DAT's Parameters field, and that has to agree with what this module
    broadcasts on. A 'number[]' entry names a ParGroup rather than a par, so the
    names it yields ('Colorr', 'Colorg', ...) are not the name in the registry —
    a second implementation of that expansion is exactly how a watcher ends up
    watching a par that doesn't exist.

    Empty when the operator or par isn't in this project; the caller decides what
    to do about it (the warning has already been printed).
    """
    return [p.name for p in _pars(entry)]


# ── wire-type coercion ────────────────────────────────────────────────────────
#
# The wire speaks only clean JSON types — bool / number / string / number[] —
# and TD does all the coercion, because the registry is where the type
# information already lives. An entry's declared type is a promise to the web
# app's TypeScript schema, so both directions coerce to it rather than passing
# TD's native value straight through and hoping it lines up.


class _WireTypeError(Exception):
    """A value doesn't fit the wire type its registry entry declares.

    Raised in both directions — reading a String par registered as 'number', or a
    browser sending a string for a 'bool'. Never fatal: the caller turns it into a
    skipped snapshot entry (plus a warning) or a param-scoped `error` reply.
    """


def _to_number(value, where):
    # bool is an int subclass in Python but serialises as JSON `true`, so letting
    # one through would reach the web as a boolean and break the schema's promise
    # that this name carries a number.
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
    # Deliberately not a plain bool(value): the string "false" is truthy, so a
    # loose cast would turn an off into an on.
    raise _WireTypeError("%s expected a boolean, got %r" % (where, value))


def _to_string(value, where):
    if isinstance(value, str):
        return value
    if hasattr(value, "path"):
        # OP-reference pars (e.g. COMP-type custom pars) eval() to the operator
        # itself, not a string — send its path over the wire instead.
        return value.path
    if isinstance(value, (int, float)):
        return str(value)
    raise _WireTypeError("%s expected a string, got %r" % (where, value))


def _read(name):
    """This param's current value, coerced to its declared wire type.

    Mode-agnostic by design: par.eval() returns the live evaluated value in every
    ParMode, so an expression-driven, exported or bound par reads correctly with
    no special handling at all. Only writes have to care about the mode.
    """
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
# A readout publishes a value with no parameter behind it — a CHOP channel, a DAT
# cell, a whole DAT table. It rides the same `params` map as REGISTRY, so the
# browser binds it by name like anything else and never learns the difference.
# Nothing below ever writes: the web-facing refusal lives in _write/_pulse, and
# there is no code path here that assigns to a CHOP or a DAT.

# Source kinds, inferred from the entry's SHAPE rather than declared. Inferring
# keeps the common cases free of boilerplate, and the shapes are disjoint: a
# 'chan' is a CHOP, a row/col is a cell, neither is the whole table.
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

# What each source may be DECLARED as when the default isn't wanted. A cell is
# deliberately not allowed to be 'bool': the string "false" is truthy, so there
# is no guess-free cast — the same reasoning that makes _to_bool refuse strings.
# Silently turning an off into an on is worse than refusing the entry.
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
    """The wire type this readout promises, defaulted from its shape.

    Raises rather than falling back, so a combination that can't be honoured is
    skipped with one clear warning instead of quietly sending a value the web's
    schema then has to cope with.
    """
    declared = entry.get("type")
    if declared is None:
        if kind == _TABLE:
            # An entry naming only an operator is indistinguishable from one
            # whose 'chan' was forgotten, so a whole-table read has to say so.
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
    """The CHOP or DAT this readout reads.

    The family check earns its line: a 'chan' entry pointed at a DAT would
    otherwise surface as a confusing missing-channel error rather than as the
    wrong-operator mistake it actually is.
    """
    path = entry.get("op")
    base = op(path) if path else None
    if base is None:
        # Same trap as REGISTRY paths: these lookups run from inside
        # WebGuiServer, so a bare name resolves against the component.
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
    """A DAT cell's contents as a number.

    Parsed here rather than sent through _to_number, which refuses strings on
    purpose. The two cases really are different: a par declared 'number' holding
    a string is a registry mistake, while a cell is a string BY NATURE and
    declaring it 'number' is the author asking for exactly this parse.
    """
    try:
        return float(text)
    except (TypeError, ValueError):
        raise _WireTypeError(
            "readout '%s' is declared 'number', but its cell holds %r" % (name, text)
        )


def _read_readout(name):
    """This readout's current value, coerced to its wire type.

    Every failure — missing operator, wrong family, missing channel, unparseable
    cell — raises _WireTypeError, so callers skip the one name with a warning
    rather than losing the whole snapshot or the whole frame's flush.
    """
    entry = _readouts()[name]
    kind = _readout_kind(entry)
    wire = _readout_type(name, entry, kind)
    base = _readout_op(name, entry, kind)
    where = "readout '%s'" % name

    if kind in (_CHANNEL, _CHANNELS):
        names = list(entry["chan"]) if kind == _CHANNELS else [entry["chan"]]
        values = []
        for chan_name in names:
            # chan() rather than base[chan_name]: it returns None for a miss
            # instead of raising, which is what lets this name the channel.
            channel = base.chan(chan_name)
            if channel is None:
                raise _WireTypeError(
                    "%s: '%s' has no channel '%s'" % (where, entry["op"], chan_name)
                )
            # eval() with no index is the value at the CURRENT time, which is the
            # whole meaning of a readout. Subscripting ([0]) would instead pin it
            # to the first sample of the buffer and never move on a time-sliced
            # CHOP.
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
        # .val, not the bare Cell. A bare Cell autocasts to a NUMBER when its
        # contents look numeric, so a cell holding "3" would reach the wire as 3
        # and break the schema's promise that this name carries a string.
        text = cell.val
        return _cell_number(name, text) if wire == "number" else text

    # The whole table. str() per cell rather than trusting rows(val=True) to hand
    # back plain strings: a non-str slipping through would raise inside
    # json.dumps and take down the entire broadcast, once per frame, for a value
    # nobody could see. Tables change at human pace, so the pass is free.
    return [[str(cell) for cell in row] for row in base.rows(val=True)]


def _readout_names():
    """The readout names this project will actually serve.

    A name in both REGISTRY and READOUTS is a config error. The parameter wins:
    it is the bidirectional contract, so dropping it would silently break writes,
    while dropping the readout costs only a value.
    """
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
    """What READOUTS asks the generated watcher DATs to observe.

    `{op path: {'family': 'CHOP'|'DAT', 'chans': [channel names]}}`, where `chans`
    is empty for a DAT — a DAT Execute DAT watches the whole table, not a cell.

    Public for the same reason par_names is: WebGuiServerExt builds the watchers
    from this, so "which operator and channels back a readout" has exactly one
    implementation. A second copy of these shape rules is precisely how a watcher
    ends up watching something this module never reads. Derived from the entry
    shapes alone, so it also works for an operator that isn't in the project yet.
    """
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
            # One operator can't be both. Whichever entry got here first decides,
            # and the other is skipped rather than silently reshaping the watcher.
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
        # Nothing to address the deferred call to. Send inline rather than drop
        # it — one message per callback is worse than one per frame, but it is
        # not nothing, and the missing DAT is reported everywhere else already.
        flush_readouts()
        return
    _readout_flush_scheduled = True
    # endFrame rather than delayFrames=1: the value still reaches the browser in
    # the frame it changed, and every callback fired during this frame's cook
    # lands in the same message.
    run("op(%r).module.flush_readouts()" % dat.path, endFrame=True)


def broadcast_channel_change(channel):
    """Queue every readout backed by this CHOP channel (CHOP Execute DAT hook).

    Called once per changed SAMPLE per channel, which is exactly why it only
    marks the name and leaves the send to flush_readouts.
    """
    owner = channel.owner
    for name in _readout_names():
        entry = _readouts()[name]
        kind = _readout_kind(entry)
        if kind not in (_CHANNEL, _CHANNELS):
            continue
        # Compared by id, like broadcast_param_change: TD hands out fresh Python
        # wrappers for its internals, so `is` is never a safe "same operator".
        target = op(entry["op"])
        if target is None or target.id != owner.id:
            continue
        names = entry["chan"] if kind == _CHANNELS else [entry["chan"]]
        if channel.name in names:
            _mark_readout_dirty(name)


def broadcast_table_change(dat):
    """Queue every readout backed by this DAT (DAT Execute DAT hook).

    Both cell and whole-table readouts of that DAT are queued: the DAT Execute
    DAT reports that the table changed, not which cell, and re-reading one cell
    is cheap enough that narrowing it would only add a way to be wrong.
    """
    for name in _readout_names():
        entry = _readouts()[name]
        if _readout_kind(entry) in (_CHANNEL, _CHANNELS):
            continue
        target = op(entry["op"])
        if target is not None and target.id == dat.id:
            _mark_readout_dirty(name)


def flush_readouts():
    """Send everything dirtied this frame to every client, as ONE `update`.

    Public because the deferred run() in _mark_readout_dirty has to name it.

    This is the whole reason the readout hooks don't broadcast directly. A CHOP
    Execute DAT fires per changed sample per channel — the docs are explicit that
    one frame "may get called 2 or more times per channel" on a time-sliced CHOP
    — so an inline broadcast would put several messages per frame on the socket
    for a single channel, and N times that for N readouts. Coalescing here makes
    the ceiling one message per frame however many readouts moved.

    Re-reading at flush time, rather than carrying each callback's `val` through,
    is what makes that collapse correct: the value sent is the one that survived
    the frame, not whichever sample happened to fire last.
    """
    global _readout_flush_scheduled
    _readout_flush_scheduled = False
    names = sorted(_dirty_readouts)
    _dirty_readouts.clear()
    # Reading costs an op lookup per name and these can go dirty every frame, so
    # skip the work entirely when nobody is listening. A browser that connects
    # later gets current values from the snapshot, not from a replayed update.
    if not names or not clients:
        return
    # Re-checked against the config rather than trusted from the mark: the config
    # DAT syncs to file, so an edit can land between a name being dirtied and this
    # flush. A KeyError here would escape the _WireTypeError handler below and
    # take the whole frame's flush with it, including the readouts that are fine.
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
    # Pulses hold no state — never part of a snapshot/update. A registered par
    # whose op/par doesn't exist is left out rather than sent as null: the
    # browser drops unknown names anyway, and a project that only has some of
    # the backing operators wired up still syncs.
    result = {}
    for name, entry in _registry().items():
        if entry["type"] == "pulse":
            continue
        if not _pars(entry):
            continue
        try:
            result[name] = _read(name)
        except _WireTypeError as e:
            # One mistyped registry entry must not cost the whole snapshot —
            # the browser would then never sync anything at all.
            _warn_missing(entry, str(e))
    # Readouts join the same map. A snapshot is the only way a newly connected
    # browser learns a readout that hasn't changed since it opened, so this is
    # not merely an optimisation over waiting for the next flush.
    for name in _readout_names():
        try:
            result[name] = _read_readout(name)
        except _WireTypeError as e:
            _warn_once(("readout", name), str(e))
    return result


def _menus():
    """Menu options for every registry entry whose backing par is a Menu.

    `{name: [{'value': key, 'label': label}]}` — the keys are what `update`
    carries, the labels are only for display.

    This is the one place TD is introspected on the web's behalf, and it exists
    for menus the web *cannot* author ahead of time: an Audio Device Out CHOP's
    device list depends on the machine TD is running on and changes when hardware
    is plugged in. A web-authored <Select options={...}> ignores all of this, so
    announcing costs projects that don't need it nothing.

    No registry field marks these — a par either has menuNames or it doesn't, and
    asking TD is more reliable than asking an author to remember. Restricted to
    'string' entries because Toggle pars also carry menuNames (['off','on']) while
    travelling the wire as bools, and announcing those would offer a dropdown for
    something rendered as a checkbox.
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


# Last announced menu map, so the optional watcher below only broadcasts on a
# real change rather than every time it runs.
_last_menus = None


def broadcast_menus_if_changed():
    """Re-announce menus to every client, but only when they've actually changed.

    Returns True if a broadcast went out, False if the menus were identical to
    the last announcement (and nothing was sent).

    Called from two places, for the same reason: TD has no event for a menu's
    *contents* changing. A Parameter Execute DAT fires on a par's value, mode,
    enable and export, but plugging in an audio interface changes none of those —
    the value is untouched, only the set of legal values grows. So there is
    nothing to subscribe to, and someone has to look again.

    Do NOT reach for a Parameter DAT (with Menu Names / Menu Labels output) plus a
    DAT Execute to get an event out of this. It looks like it should work and it
    does not: measured on 2025.33070, changing a par's menuNames fires
    onTableChange ZERO times, while changing that same par's *value* fires it once
    — so the wiring is fine and the menu change simply doesn't notify. Derivative
    logged this as a bug in April 2021 (forum.derivative.ca/t/breaking-binding-a-
    dropdown-menu-out-to-a-perform-ui/13123) and it is still open. The DAT's
    content is fresh whenever you pull it; what never arrives is the nudge to pull.

    1. **A `menus-request` from the browser** (a "reload devices" button). This is
       the cheaper and more predictable of the two, because the person who just
       plugged the device in is right there to ask.
    2. **An optional TD-side poll**, for menus that must refresh with nobody
       watching. Wire it to an Execute DAT's onFrameStart, gated so it runs every
       second or two rather than every frame — device changes are human-paced:

               def onFrameStart(frame):
                       if absTime.frame % 120:   # ~2s at 60fps
                               return
                       op.WebGuiServer.op('webserver1_callbacks').module.broadcast_menus_if_changed()

       Not wired up by default: it costs a menuNames read per registered menu par
       per tick, forever, for something most projects never need.
    3. **Best, when it applies: the pulse that causes the change.** If a menu is
       rebuilt by a TD action rather than by the OS — a Screen Grab TOP's Refresh
       Sources, say — hook THAT pulse (a Parameter Execute DAT's onPulse) and call
       this. It's a real event, so no poll and no button. Audio devices don't
       qualify: the OS changes that list, not a par, which is why they use (1).

    The diff is what makes either safe to call freely — an unchanged list sends
    nothing, so no client is woken for a no-op.
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
    """Send back a param-scoped `error` if a write/pulse refused, else nothing.

    `problem` is what _write/_pulse return: None, or an (code, message) pair. The
    `ref` is what lets the browser recover this one param — td-core keys its
    read-only marking and re-snapshot on it — so it is always carried.
    """
    if problem is None:
        return
    code, detail = problem
    _send(client, {"type": "error", "code": code, "message": detail, "ref": name})


# ── WebRTC signaling ──────────────────────────────────────────────────────────


def _webrtc():
    """The project's WebRTC DAT, as `(dat, problem)`.

    `dat` is None when video isn't usable and `problem` says which of two very
    different causes it was: video not configured at all, versus WEBRTC naming an
    operator that isn't there. Those need opposite fixes, so collapsing both into
    one "no video" error sends you looking in the wrong place.
    """
    name = getattr(_config(), "WEBRTC", None)
    if not name:
        return None, "this project exposes no video - set WEBRTC in the config DAT"
    dat = op(name)
    if dat is None:
        # Same trap as REGISTRY paths: these lookups run from inside WebGuiServer,
        # so a bare name resolves against the component, not the project root.
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
    """Set `owner.par.<name>`, reporting usefully if that parameter isn't there.

    A missing par would otherwise fail silently and surface much later as a peer
    that negotiates but carries no video, so the miss prints the operator's type
    and its full parameter list — enough to spot a wrong operator or a renamed
    par without a debugger.
    """
    if hasattr(owner.par, name):
        setattr(owner.par, name, value)
        return True
    print(
        "webserver-callbacks: warning - %s (%s) has no par '%s'\n  its pars are: %s"
        % (owner.path, owner.OPType, name, sorted(p.name for p in owner.pars("*")))
    )
    return False


def _add_tracks(webrtc, connection):
    """Declare a video track per configured stream, before answering.

    This is what puts the media property in the local SDP — the docs are explicit
    that addTrack must precede createOffer/createAnswer. Skip it and the answer
    still negotiates perfectly happily, but its video m-line comes back
    `a=inactive`: the browser gets a live-but-muted receiver, a peer that reaches
    `connected`, and no error on either side.

    The stream id doubles as the track id, which is also the value the TOP's
    `webrtcvideotrack` menu is later set to.
    """
    for stream_id in _streams():
        if not webrtc.addTrack(connection, stream_id, "video"):
            print(
                "webserver-callbacks: warning - addTrack failed for '%s' on %s"
                % (stream_id, connection)
            )


def _stream_top(stream_id):
    """The Video Stream Out TOP carrying `stream_id`.

    Generated inside WebGuiServer by WebGuiServerExt, at the end of a
    select -> flip -> videostreamout chain built from the config's STREAMS entry
    — so it is asked for by stream id rather than looked up by path, and the
    naming convention lives in that one file. None when the extension hasn't run
    (or isn't there), which is a setup problem rather than a per-peer one.
    """
    getter = getattr(_webgui(), "StreamTop", None)
    return getter(stream_id) if getter is not None else None


def attach_streams(connection):
    """Point every generated Video Stream Out TOP at this peer's track.

    Public because the deferred `run()` below has to name something.

    Deferred by a frame: the TOP's WebRTC parameters are *menus* populated from
    the DAT — setting `webrtc` fills the connection menu, and setting
    `webrtcconnection` fills the track menu — so the values can't be selected
    until the DAT has cooked and published them. This only governs which TOP
    feeds pixels into the track; the SDP was already settled by _add_tracks.

    These three pars are the whole of what is per-peer; everything else about the
    TOP is settled by the Rebuild that generated it.

    One TOP carries one connection, so a second browser connecting re-points the
    same TOP and takes the stream away from the first. Serving several browsers
    at once needs one Video Stream Out TOP per client; single-viewer is the v1
    assumption (see docs/touchdesigner-setup.md § Video), and _handle_rtc_offer
    says so out loud when a second one negotiates.
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
        # Lowercase: these are built-in pars. (Custom pars are capitalized — see
        # REGISTRY — which is not the same convention.)
        _set_par(top, "webrtc", webrtc)
        _set_par(top, "webrtcconnection", connection)
        # Audio is out of scope for v1, so only the video track is claimed.
        _set_par(top, "webrtcvideotrack", stream_id)


def _attach_streams_next_frame(connection):
    # run() executes its script detached from this module, so the callbacks DAT
    # is addressed by absolute path rather than the config's bare name.
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
        # Without this a peer (and its encoder) leaks on every browser refresh.
        webrtc.closeConnection(connection)


def send_signaling(connection, message):
    """Send one signaling message to the browser owning `connection`.

    Called by webrtc-callbacks.py, which has the WebRTC DAT's local SDP and
    ICE but not the sockets. Silently dropped once the browser has gone — the
    peer is on its way down with it.
    """
    client = client_by_peer.get(connection)
    if client is not None:
        _send(client, message)


def _handle_rtc_offer(client, sdp):
    """Answer a browser's offer.

    The browser is the offerer on connect and on rebuild, so this is the normal
    path. A rebuild arrives as a fresh offer on the same socket, so any previous
    peer for this client is torn down first rather than left orphaned.
    """
    webrtc, problem = _webrtc()
    if webrtc is None:
        _send(client, {"type": "error", "code": "video_unavailable", "message": problem})
        print("webserver-callbacks: %s" % problem)
        return
    if not _streams():
        # A peer with no tracks negotiates cleanly and then shows nothing, which
        # is far harder to diagnose than being told up front.
        print(
            "webserver-callbacks: warning - WEBRTC is set but STREAMS is empty, "
            "so the peer will carry no video"
        )

    # Single-viewer is a v1 limit of the TOPs, not of the peer: each Video Stream
    # Out TOP holds ONE connection, so attach_streams below re-points this
    # project's TOPs at whoever negotiated last and the earlier browser's tiles
    # freeze on their final frame. Newest-wins is the predictable half of that (a
    # refresh always gets you video back); saying so is the other half, because
    # the victim sees no error at all — its peer stays happily `connected`.
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

    # Order is load-bearing: tracks must exist before the answer is built, or its
    # video m-line comes back `a=inactive`. Pointing the TOPs at those tracks is
    # a separate, deferred step — it feeds pixels and doesn't touch the SDP.
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
    """Add a remote ICE candidate.

    `candidate: null` is end-of-candidates and carries no m-line association, so
    it is dropped rather than forwarded — TD finishes checking on its own, and
    there is no addIceCandidate(None) to call.
    """
    webrtc, _ = _webrtc()
    connection = peer_by_client.get(client)
    candidate = message.get("candidate")
    if webrtc is None or connection is None or not candidate:
        return
    # Argument order is the DAT's: candidate, line index, then mid.
    webrtc.addIceCandidate(
        connection, candidate, message.get("sdpMLineIndex"), message.get("sdpMid")
    )


def _refuse_write(name, entry, pars):
    """Why a web write must not touch these pars, or None when it may.

    Two independent gates, both of which have to pass:

    1. The registry author marked the entry `writable: False` — a readout the web
       is never meant to drive.
    2. Any backing par is in a mode other than CONSTANT.

    The second one matters more than "the write wouldn't take anyway", which is
    the intuition it's easy to have here. On 2025.33070, assigning par.val to an
    EXPRESSION- or EXPORT-mode par **flips that par into CONSTANT mode**, and the
    expression stops driving it for good — the text survives in par.expr, but
    nothing evaluates it any more. So an unguarded web write doesn't quietly fail;
    it detaches a TD author's expression, and the damage outlives the browser
    session that caused it.

    BIND is refused alongside them even though a two-way bind was observed to
    propagate the write to its master rather than break. It can't be assumed
    writable either, and refusing is the recoverable direction: the browser gets a
    visible error instead of silently driving something it may not own.

    Checked per component for arrays, so a half-constant ParGroup (Positionx
    constant, Positiony expression) is refused whole rather than half-applied.
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
    """Reject a menu key TD doesn't have, rather than let it snap to entry 0.

    A Menu par assigned an unrecognised key raises nothing and silently takes its
    FIRST menu entry — and the Parameter Execute DAT then broadcasts that value
    back as though the user had picked it. <Select>'s options are authored on the
    web side by design (TD is never introspected), so drift between them and TD's
    menu is an expected failure rather than a freak one, and it earns a real error
    instead of a mystery jump to whatever happens to sort first.
    """
    names = getattr(par, "menuNames", None)
    if names and value not in names:
        # Truncated: a built-in menu can run to dozens of keys (blend mode has
        # 46), and this message travels over the wire to a console.
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
            # zip() would truncate here, half-applying a colour or an XYZ and
            # leaving no trace of why. A length mismatch means the web schema and
            # the registry have drifted apart, which is worth saying out loud.
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
    """Apply a wire value to its backing parameter(s).

    Returns None on success, or an (error code, message) pair for the caller to
    send back as a param-scoped `error`.
    """
    entry = _registry().get(name)
    if entry is None:
        if name in _readouts():
            # A real name, just not a writable one. param_not_writable rather
            # than unknown_param is also what makes the web's runtime safety net
            # fire: it marks the name read-only from then on and re-requests a
            # snapshot, so the optimistic edit snaps back instead of sticking.
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
    # Every component is coerced before any is assigned, so a bad third component
    # can't leave the first two already written to the project.
    for par, coerced in zip(pars, values):
        par.val = coerced
    return None


def _pulse(name):
    """Fire a momentary parameter (web -> TD only, no synced state).

    Returns None on success, or an (error code, message) pair.

    No mode guard here, unlike _write: par.pulse() leaves the mode alone (checked
    on 2025.33070 — an EXPRESSION-mode par is still in EXPRESSION mode after a
    pulse), so it can't detach an expression the way par.val does. The registry's
    writable flag is still honoured, since that one is the author saying "the web
    does not drive this", regardless of mechanism.
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
    """
    Push a single TD-side parameter change to all connected browsers.

    Call this from a Parameter Execute DAT watching the backing operators, so an
    edit made inside TD (or by another client) reflects in every browser. Edits
    that arrive from the web also flow through here, because onWebSocketReceiveText
    sets par.val, which fires the Parameter Execute DAT — one uniform broadcast
    path. The originating browser ignores its own echo while the input is focused.
    Pulse pars never reach here in practice (they're fired via par.pulse(), which
    doesn't raise Value Change), but are skipped regardless since they hold no
    synced state to broadcast.
    """
    owner = par.owner
    for name, entry in _registry().items():
        if entry["type"] == "pulse":
            continue
        # Compared by id, not by `is`. TD hands out fresh Python wrapper objects
        # for its internals (documented for Par: `p is p` is always False), so
        # identity is not a safe way to ask "same operator". id is stable for the
        # life of the node.
        target = op(entry["op"])
        if target is None or target.id != owner.id:
            continue
        # Matched against the group's actual components rather than by name
        # prefix: a 'Colormode' par changing must not be mistaken for a component
        # of the 'Color' ParGroup and broadcast as one.
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


# return the response dictionary
def onHTTPRequest(
    dat: webserverDAT, request: Dict[str, Any], response: Dict[str, Any]
) -> Dict[str, Any]:
    response["statusCode"] = 200  # OK
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
    # Re-register on every message, not just at onWebSocketOpen. Re-cooking this DAT
    # (editing it, or a Sync to File reload) rebuilds the module and empties
    # `clients` while the sockets stay open — broadcasts would then go to nobody
    # while the browser kept talking to TD, which reads as "TD -> web is broken".
    # The heartbeat ping restores the set within one interval.
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
        # Menus first, then values. A <Select> that received its value before the
        # options it belongs to would briefly have nothing to match it against and
        # render as though TD had selected nothing.
        #
        # Answered here rather than after `welcome` so the browser re-learns the
        # menus on every reconnect and resync — which is also how a device list
        # that changed while the socket was down gets picked up.
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
        # A "reload devices" button. Re-reads the menus and broadcasts if they
        # really changed, so *every* client learns about the new device — not just
        # whoever clicked. When nothing changed the broadcast is skipped, so the
        # requester is answered directly; either way it gets exactly one reply and
        # the button always has a definite result.
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

    # Unknown types are ignored, so a newer web client can add messages without
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
