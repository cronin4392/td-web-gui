"""
td-core project config — copy this file into your project and edit it.

This is the ONE file you write per project. The other six scripts in this
folder are project-agnostic and are dropped in unchanged:

        webserver-callbacks.py   Web Server DAT callbacks  (params + inbound signaling)
        webgui-server-ext.py     WebGuiServer extension    (generates the watchers and
                                                            video chains below)
        parameter-execute.py     Parameter Execute DATs    (TD -> web param broadcast)
        chop-execute.py          CHOP Execute DATs         (TD -> web readout broadcast)
        dat-execute.py           DAT Execute DATs          (TD -> web readout broadcast)
        webrtc-callbacks.py      WebRTC DAT callbacks      (outbound video signaling)

All of them find this file through the WebGuiServer component's `Config File`
parameter, loaded into a Text DAT named `config` inside the component, and
read back as `parent.WebGuiServer.op('config').module`.

REGISTRY and READOUTS below are the whole of the setup for TD -> web: the
extension generates one watcher DAT per operator you name in either, so there
is no watcher to create or keep in sync by hand. STREAMS works the same way
for video — name the TOP you want streamed and the encoder chain is generated.

The instance name the web app sees comes from WebGuiServer's `Identifier`
parameter, not from anything in here.

See docs/touchdesigner-setup.md for the full walkthrough.
"""

# ── Wiring ───────────────────────────────────────────────────────────────────

# Name of the Web Server DAT's callbacks DAT, resolved from *inside*
# WebGuiServer (use an absolute path if it lives elsewhere). TD operator names
# can't contain hyphens, so this won't literally be "webserver-callbacks".
CALLBACKS = "webserver1_callbacks"


# ── Parameters ───────────────────────────────────────────────────────────────

# friendly wire name -> backing parameter.
#
#   op:   Absolute path to the operator, e.g. '/project1/params'. These
#         lookups run from inside WebGuiServer, so a bare name resolves
#         against the component, not your project — always use an absolute path.
#
#   par:  The parameter name on that operator. Custom parameters are
#         Capitalized ('Intensity'); TD's built-in parameters are lowercase
#         ('device', 'mode'). Getting this wrong fails silently.
#
#   type: 'bool' | 'number' | 'string' | 'number[]' | 'pulse'
#         - 'number[]' names the ParGroup's base name (e.g. 'Position' for the
#           tuple pars Positionx/Positiony/Positionz). The ParGroup's component
#           order IS the array order on the wire.
#         - 'pulse' holds no state: excluded from snapshots, written via the
#           dedicated `pulse` message rather than `update`, and calls par.pulse().
#
#   writable: Optional, defaults True. False makes the entry read-only to the
#         web — it still snapshots and broadcasts, but a write is refused with
#         `param_not_writable`. For a value with no parameter behind it at
#         all, use READOUTS below instead. Not sent to the web (the browser
#         authors its own read-only set); a par in EXPRESSION/EXPORT/BIND mode
#         is refused regardless of this flag, so it's only needed for a
#         CONSTANT par you want to keep TD-driven.
#
# These names must match the keys of your TypeScript param schema on the web
# side. Nothing checks that for you — see docs/protocol.md § Keeping the two
# sides in sync.
REGISTRY = {
    # 'message':   {'op': '/project1/params', 'par': 'Message',   'type': 'string'},
    # 'intensity': {'op': '/project1/params', 'par': 'Intensity', 'type': 'number'},
    # 'enabled':   {'op': '/project1/params', 'par': 'Enabled',   'type': 'bool'},
    # 'reset':     {'op': '/project1/params', 'par': 'Reset',     'type': 'pulse'},
    # 'position':  {'op': '/project1/params', 'par': 'Position',  'type': 'number[]'},
    # 'color':     {'op': '/project1/params', 'par': 'Color',     'type': 'number[]'},
    # 'fps':       {'op': '/project1/info',   'par': 'Fps',       'type': 'number',
    #               'writable': False},
}


# ── Readouts (optional) ──────────────────────────────────────────────────────

# friendly wire name -> data read straight out of a CHOP or a DAT, with no
# parameter in between. **One-way, TD -> web, always.**
#
# Use these for data rather than settings: an analysis CHOP's level, a
# timecode, a now-playing table. Exporting such a value onto a parameter just
# to publish it works, but costs a par per value and puts it in EXPORT mode,
# which the web then has to refuse writes to anyway.
#
# Readouts share the wire namespace with REGISTRY: same `snapshot`/`update`
# messages, bound by name exactly like a parameter (`<Value name="fps" />`) —
# the web never learns which side of this file a name came from. A name in
# BOTH maps is a config error: the REGISTRY entry wins, the readout is
# ignored, and a warning names it.
#
#   op:   Absolute path to the CHOP or DAT — same rule as REGISTRY.
#
# The rest of the entry says what to read, and its SHAPE picks the source:
#
#   chan: 'level'              one CHOP channel        -> number
#   chan: ['low','mid','high'] several CHOP channels   -> number[]
#   row/col: 'title', 1        one DAT cell            -> string
#   (neither, + the type)      the whole DAT table     -> string[][]
#
#   type: Optional, defaults to the natural type above. A channel may also be
#         'bool' (a 0/1 gate) or 'string'; a cell may also be 'number'
#         (parsed, and an unparseable cell is skipped with a warning). A cell
#         may NOT be 'bool' — the string "false" is truthy, so there's no
#         guess-free cast. **A whole-table readout must declare
#         `'type': 'string[][]'`**, since an op-only entry is otherwise
#         indistinguishable from one where you forgot the `chan`.
#
# Channel order is the array order on the wire, exactly like a ParGroup's
# component order. A pattern ('band*') is deliberately not accepted — it would
# make the array's length and order depend on what the CHOP happens to hold.
#
# **Rate.** A CHOP Execute DAT fires once per changed SAMPLE per channel, but
# everything dirtied within a frame is coalesced into one `update` at end of
# frame, so the ceiling is one message per frame no matter how many readouts
# change — still 60/sec for a channel that changes every frame, so resample or
# filter in TD if you don't need that resolution.
READOUTS = {
    # 'fps':    {'op': '/project1/perf_stats',  'chan': 'fps'},
    # 'level':  {'op': '/project1/audio_bands', 'chan': ['low', 'mid', 'high']},
    # 'playing':{'op': '/project1/transport',   'chan': 'playing', 'type': 'bool'},
    # 'track':  {'op': '/project1/nowplaying',  'row': 'title', 'col': 1},
    # 'cues':   {'op': '/project1/cue_table',   'type': 'string[][]'},
}


# ── Video (optional) ─────────────────────────────────────────────────────────

# The WebRTC DAT, as a bare name when it sits inside WebGuiServer beside the
# callbacks DAT, or an absolute path otherwise.
#
# Leave as None for a params-only project: the signaling branches then reply
# with a clear error instead of raising.
WEBRTC = None

# friendly stream id -> the TOP whose picture that stream carries.
#
#   source: Absolute path to the TOP you want on the web — same path rule as REGISTRY.
#   label:  Optional human-readable name, passed through to the browser.
#   width:  Optional pixel cap on the encoded picture, default 480. Aspect is
#           preserved and a smaller source is left alone, never upscaled.
#   fps:    Optional encode rate, default 15 — independent of the project rate.
#
# `width` and `fps` are the two knobs on what a stream costs: the Video Stream
# Out TOP encodes every frame at full resolution, so a wall of them at project
# resolution and project rate will drop your frame rate. Raise them per entry
# only for the streams that need it.
#
# **You do not build the encoder.** WebGuiServerExt generates one per entry on
# the next Rebuild. Your own chain ends at `source` — don't add a Flip TOP or
# otherwise compensate for the mirroring TD's WebRTC encoder introduces, since
# that's corrected downstream of `source` and doing it twice cancels out.
#
# The id is what `<Video stream="...">` selects on. The `mid` pairing an id to
# a track is derived from the negotiated SDP, not authored here. A bare
# `<Video />` takes the first entry.
#
# **Insertion order is load-bearing** — webrtc-callbacks.py zips this dict
# against the video m-lines of the negotiated SDP in order, so reordering
# entries reassigns which id names which track.
#
# One Video Stream Out TOP serves ONE peer, so N entries here are N streams
# for ONE browser, not one stream for N browsers — see
# docs/touchdesigner-setup.md § Video for the single-viewer limit.
STREAMS = {
    # 'main': {'source': '/project1/render_out', 'label': 'Main'},
}


# ── Handlers (optional) ──────────────────────────────────────────────────────

# friendly call name -> `fn(args) -> JSON-serializable`, invoked by the web via
# `await TD.call('name', args)`. Called inside a try/except: a raised
# exception prints to the Textport and replies `handler_error` rather than
# ever escaping the socket. `args` is whatever JSON the web sent (or None); the
# return value must be JSON-serializable or the reply is `result_not_serializable`.
#
#   def _print(args):
#       print("web says:", (args or {}).get("text", ""))
#       return {"ok": True}
#
#   HANDLERS = {"print": _print}
#
# This is one-way (web -> TD) invocation. The other direction — TD invoking a
# handler the web page registered via `createTDHandler`/`connection.handle()`
# — needs no registry here: call `parent.WebGuiServer.Notify('name', args)`
# for fire-and-forget, or `parent.WebGuiServer.Call('name', args, on_result=fn)`
# for a reply, from anywhere in project code. See docs/touchdesigner-setup.md
# § Handlers.
HANDLERS = {}
