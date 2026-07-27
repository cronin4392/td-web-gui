"""
Project configuration for the TD Web GUI bridge — instance 1 of the
multi-instance reference project (td/Example1/Example.toe, driving the left
column of apps/example). One registry entry per control kind in that app, so
every control there has a working backing par.

Its sibling is td/Example2/Example2.toe, a second TouchDesigner process on its
own port with a deliberately DIFFERENT schema — see that file's config.py. The
two are independent: separate WebSocket, separate WebRTC peer, separate
reconnect lifecycle. Nothing but the web page knows they are related.

The param map lives here. packages/td-core/touchdesigner/webserver-callbacks.py and packages/td-core/touchdesigner/parameter-execute.py
are drop-in copies that read it back out via op.WebGuiServer.op('config').module.

Setup: point the WebGuiServer component's Config File par at this file — it
loads it into the `config` Text DAT the two scripts read. The instance name the
web app sees is WebGuiServer's Identifier par, not a value in this file.

Backing operators this project expects — a single `/project1/params` Base COMP
with one custom par per REGISTRY entry, plus `/project1/readouts` holding the
CHOP and DAT sources for READOUTS (see that section below):
        Message    String
        Intensity  Float   (0-1)
        Enabled    Toggle
        Reset      Pulse
        Gate       Toggle
        Mute       Toggle
        Blendmode  Menu    (menu keys must match apps/example's Select options)
        Position   XYZ     (Float) -> Positionx/Positiony/Positionz
        Color      RGBA    (Float, 0-1) -> Colorr/Colorg/Colorb/Colora

plus, for the TD-announced-menu demo:
        /project1/audiodevicein_demo  Audio Device In CHOP, Active off. Only its
                                      built-in `device` menu is used — the CHOP is
                                      there to own a menu the web cannot author.

Video additionally expects:
        webrtc1                       WebRTC DAT inside WebGuiServer, beside the
                                      Web Server DAT's callbacks.
        /project1/videowall           the four-tile wall: in_source → res_cap →
                                      level_tile1…4 → video1…4. It ends at those
                                      Nulls; the encoders are generated from
                                      STREAMS.

All four tiles ride the **one** peer this instance opens — a peer carries many
tracks, and that is why `<Video>` selects on a stream id rather than on a
connection. Four here and four in Example2: the same total encoder load as one
eight-stream wall, across two peers instead of one. Per-tile tinting is
deliberate: four identical pictures
would hide a mid-to-id mis-mapping, and a scrambled colour order will not.
Example2 tints its four with the other half of the same palette, so a tile
rendered under the wrong instance is visible too.

The wall deliberately does NOT correct for the X-mirroring TD's WebRTC encoder
introduces — that is handled downstream of the TOPs STREAMS names, and doing it
here as well would cancel out.

The watcher DATs and the encoders are NOT set by hand. WebGuiServerExt generates
them from REGISTRY, READOUTS and STREAMS.

This project exercises both Parameter Execute toggle paths: `/project1/params`
holds only custom pars, while `/project1/audiodevicein_demo` holds the built-in
`device`, so those two DATs get `Custom` and `Built-In` respectively rather than
both globally. Pulse entries are skipped entirely — pulses raise On Pulse, not
Value Change, so `reset` needs no watcher.

Set by hand, because they're parameters on the DATs rather than values read
from here:
        Web Server DAT          Callbacks DAT = the callbacks DAT named below;
                                Port = `op.WebGuiServer.par.Port`.
        WebRTC DAT              Callbacks DAT = packages/td-core/touchdesigner/webrtc-callbacks.py's DAT;
                                ICE Servers = empty (browser and TD share a machine).
"""

# The Web Server DAT's callbacks DAT — the Parameter Execute DAT reads this to
# find the module it broadcasts through. Resolved inside WebGuiServer by both
# scripts, so a bare name is right when it sits in the component; use an absolute
# path if it lives elsewhere. TD op names can't contain hyphens, so this won't
# literally be "webserver-callbacks".
CALLBACKS = "webserver1_callbacks"

# The WebRTC DAT, for video. A bare name because it sits inside
# WebGuiServer alongside the callbacks DAT — these lookups run from in there, so
# a bare name resolves against the component. Set to None in a project with no
# video: the signaling branches then reply with an error instead of raising, and
# the param side is unaffected.
WEBRTC = "webrtc1"

# friendly stream id -> the TOP whose picture that stream carries.
#   source: absolute path to the TOP you want on the web.
#   label:  optional human-readable name, passed through to the browser.
# The encoder is generated per entry inside WebGuiServer, so these paths name the
# last op in the wall that is about the picture, and the wall ends there.
#
# The id is what `<Video stream="...">` selects on; the mid pairing an id to a
# track is derived from the negotiated SDP, not authored here. A bare `<Video />`
# takes the first entry, so `tile1` is the single-stream default.
#
# **Insertion order is load-bearing.** webrtc-callbacks zips this dict against the
# video m-lines of the negotiated SDP in order, so reordering these entries
# reassigns which tile each id names. Keep them in tile order.
#
# One TOP serves one peer — its WebRTC Connection par holds a single value — so
# these four are four streams for ONE browser, not one stream for four browsers.
# Serving a second viewer simultaneously needs a second set of four TOPs; v1 is
# single-viewer and the callbacks warn when a second one negotiates. Note that
# the two instances are NOT a second viewer of each other: each browser tab opens
# one peer per instance, so a single tab holds two peers of four tracks each.
STREAM_COUNT = 4
STREAMS = {
    "tile%d" % n: {
        "source": "/project1/videowall/video%d" % n,
        "label": "Tile %d" % n,
    }
    for n in range(1, STREAM_COUNT + 1)
}

# friendly wire name -> backing parameter.
#   op:   absolute path, e.g. '/project1/params'. WebGuiServer is a global
#         operator that can live anywhere and these lookups run from inside it,
#         so a bare name resolves against the component, not your project.
#   type: 'bool' | 'number' | 'string' | 'number[]' | 'pulse'
#     - 'number[]' entries reference the ParGroup's base name (e.g. 'Position'
#       for the tuple pars 'Positionx'/'Positiony'/'Positionz'); component
#       order there is the wire array order.
#     - 'pulse' entries hold no state: excluded from snapshot, written via a
#       dedicated `pulse` message (not `update`), and call par.pulse().
#   writable: optional, defaults True. False makes the entry read-only to the
#       web — it still snapshots and broadcasts, but a write is refused with a
#       `param_not_writable` error instead of applied. Use it for readouts the
#       browser must never drive. Note this flag is NOT sent to the web: the web
#       authors its own read-only set beside its schema (see apps/example), and
#       this is the TD-side backstop. A par in EXPRESSION/EXPORT/BIND mode is
#       refused whether or not it's flagged, so this is only needed for a
#       CONSTANT par you want to keep TD-driven.
REGISTRY = {
    "message": {
        "op": "/project1/params",
        "par": "Message",
        "type": "string",
    },
    "intensity": {
        "op": "/project1/params",
        "par": "Intensity",
        "type": "number",
    },
    "enabled": {
        "op": "/project1/params",
        "par": "Enabled",
        "type": "bool",
    },
    "reset": {
        "op": "/project1/params",
        "par": "Reset",
        "type": "pulse",
    },
    "gate": {
        "op": "/project1/params",
        "par": "Gate",
        "type": "bool",
    },
    "mute": {
        "op": "/project1/params",
        "par": "Mute",
        "type": "bool",
    },
    "blendmode": {
        "op": "/project1/params",
        "par": "Blendmode",
        "type": "string",
    },
    "position": {
        "op": "/project1/params",
        "par": "Position",
        "type": "number[]",
    },
    "color": {
        "op": "/project1/params",
        "par": "Color",
        "type": "number[]",
    },
    # The TD-announced-menu case. Unlike 'blendmode' (whose keys the web app
    # hardcodes), nothing about this menu can be authored in advance: the keys are
    # machine-specific device GUIDs like
    #   {0.0.1.00000000}.{feb5e51a-...}||Voicemeeter_Out_A4_(VB-Audio...)||1
    # paired with readable labels, and the whole list changes when hardware is
    # plugged in. The callbacks announce it over the `menus` message and
    # apps/example renders <Select name="audiodevice" /> with no options prop.
    #
    # Note the lowercase par name: `device` is a built-in par, and only custom
    # pars are capitalized like the ones above.
    "audiodevice": {
        "op": "/project1/audiodevicein_demo",
        "par": "device",
        "type": "string",
    },
}

# friendly wire name -> a value read straight out of a CHOP or DAT, with no
# parameter in between. One-way, TD -> web. The entry's shape picks the source and
# the wire type; `type` appears only where it overrides that. One entry per shape
# here, with the sources in /project1/readouts.
#
# Full reference: packages/td-core/docs/touchdesigner-setup.md § Readouts.
READOUTS = {
    "fps": {
        "op": "/project1/readouts/null_stats",
        "chan": "fps",
    },
    # A Perform CHOP ships with only `fps` enabled — `cook` was toggled on for
    # this entry, which is also the one type override in the project.
    "cooking": {
        "op": "/project1/readouts/null_stats",
        "chan": "cook",
        "type": "bool",
    },
    "bands": {
        "op": "/project1/readouts/null_bands",
        "chan": ["low", "mid", "high"],
    },
    "track": {
        "op": "/project1/readouts/nowplaying",
        "row": "title",
        "col": 1,
    },
    "cues": {
        "op": "/project1/readouts/cue_table",
        "type": "string[][]",
    },
}
