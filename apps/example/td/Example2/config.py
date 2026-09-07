"""
Project configuration for the TD Web GUI bridge — instance 2 of the
multi-instance reference project (td/Example2/Example2.toe, driving the right
column of apps/example).

**This file exists to be different from its sibling.** Example1's config is the
kitchen sink: one registry entry per control kind, every readout shape, both
menu cases. This one is a second machine doing a smaller, different job — a
playback node — and its schema says so:

        - different wire NAMES for the same kinds of thing (`label`, not
          `message`; `opacity`, not `intensity`; `tint`, not `color`),
        - a strict subset of the kinds: no menus at all, no multi-component
          control par beyond the colour, no table readout,
        - one entry, `opacity`, flagged `writable: False`.

That divergence is the point, and it is not cosmetic. The web app holds a
separate `createTDClient<Schema>()` per instance, so these names are what
autocompletes — and typing one of Example1's names into Example2's column is a
compile error rather than a silently dropped `update`. It also shows the wire
name is web-facing only: `label` here and `message` there are the same TD par
(`/project1/params/Message`) in two projects that happen to share an ancestor.

The two instances are otherwise wholly independent — separate process, separate
port, separate WebSocket, separate WebRTC peer, separate reconnect lifecycle.
Killing one leaves the other's column live; nothing but the browser page knows
they are related.

The param map lives here. packages/td-core/touchdesigner/webserver-callbacks.py and packages/td-core/touchdesigner/parameter-execute.py
are drop-in copies that read it back out via op.WebGuiServer.op('config').module.

Setup: point the WebGuiServer component's Config File par at this file — it
loads it into the `config` Text DAT the two scripts read. The instance name the
web app sees is WebGuiServer's Identifier par ('example2'), not a value in this
file; the port likewise (9981, so the two instances don't collide).

Backing operators this project expects — a single `/project1/params` Base COMP,
plus `/project1/readouts` holding the CHOP sources for READOUTS:
        Message    String
        Intensity  Float   (0-1)
        Enabled    Toggle
        Reset      Pulse
        Color      RGBA    (Float, 0-1) -> Colorr/Colorg/Colorb/Colora

This .toe also carries operators it never exposes — a Blendmode menu par, an
audiodevicein_demo CHOP, the nowplaying and cue_table DATs. Leaving them
unregistered is deliberate: a TD project is usually larger than what it chooses
to expose, and this is the case where that shows.

Video additionally expects:
        webrtc1                       WebRTC DAT inside WebGuiServer, beside the
                                      Web Server DAT's callbacks.
        /project1/videowall           the four-tile wall: in_source → res_cap →
                                      level_tile1…4. It ends at those Level TOPs;
                                      the encoders are generated from STREAMS.

All four tiles ride the **one** peer this instance opens — a peer carries many
tracks, and that is why `<Video>` selects on a stream id rather than on a
connection. Four here and four in Example1: the same total encoder load as one
eight-stream wall, across two peers instead of one. These four are tinted with
the half of the palette Example1's wall doesn't use, so a tile rendered under the
wrong instance is as visible as a mis-mapped mid is inside one.

The wall deliberately does NOT correct for the X-mirroring TD's WebRTC encoder
introduces — that is handled downstream of the TOPs STREAMS names, and doing it
here as well would cancel out.

The watcher DATs and the encoders are NOT set by hand. WebGuiServerExt generates
them from REGISTRY, READOUTS and STREAMS, reconciling against whatever is live —
so this file's smaller schema simply yields fewer watchers than Example1's.

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
# The ids repeat Example1's (`tile1`…`tile4`) rather than continuing its
# numbering, because a stream id is only ever resolved within its own peer —
# `<Video>` reads the nearest provider's stream map, and the two providers have
# separate ones. Numbering these 5-8 would imply a shared namespace that doesn't
# exist, and the browser page labels the column with the instance anyway.
STREAM_COUNT = 4
STREAMS = {
    "tile%d" % n: {
        "source": "/project1/videowall/level_tile%d" % n,
        "label": "Tile %d" % n,
    }
    for n in range(1, STREAM_COUNT + 1)
}

# friendly wire name -> backing parameter.
#   op:   absolute path, e.g. '/project1/params'. WebGuiServer is a global
#         operator that can live anywhere and these lookups run from inside it,
#         so a bare name resolves against the component, not your project.
#   type: 'bool' | 'number' | 'string' | 'number[]' | 'pulse'
#     - 'number[]' entries reference the ParGroup's base name (e.g. 'Color' for
#       the tuple pars 'Colorr'/'Colorg'/'Colorb'/'Colora'); component order
#       there is the wire array order.
#     - 'pulse' entries hold no state: excluded from snapshot, written via a
#       dedicated `pulse` message (not `update`), and call par.pulse().
#   writable: optional, defaults True. False makes the entry read-only to the
#       web — it still snapshots and broadcasts, but a write is refused with a
#       `param_not_writable` error instead of applied. A par in EXPRESSION/
#       EXPORT/BIND mode is refused whether or not it's flagged, so this is only
#       needed for a CONSTANT par you want to keep TD-driven.
#
# The names are this instance's own vocabulary, not Example1's — see the module
# docstring for why that divergence is the point rather than an inconsistency.
REGISTRY = {
    "label": {
        "op": "/project1/params",
        "par": "Message",
        "type": "string",
    },
    # The only `writable: False` entry in either project, and the reason this
    # instance carries one: the flag is NOT sent to the web, so the browser's
    # read-only set is authored separately beside its schema. Having one entry
    # where the two sides agree by convention rather than over the wire makes the
    # disagreement testable — drop 'opacity' from apps/example's readonly list
    # and the control renders enabled, sends, and comes back refused with a
    # `param_not_writable` that snaps the optimistic edit back on re-snapshot.
    "opacity": {
        "op": "/project1/params",
        "par": "Intensity",
        "type": "number",
        "writable": False,
    },
    "playing": {
        "op": "/project1/params",
        "par": "Enabled",
        "type": "bool",
    },
    "restart": {
        "op": "/project1/params",
        "par": "Reset",
        "type": "pulse",
    },
    "tint": {
        "op": "/project1/params",
        "par": "Color",
        "type": "number[]",
    },
}

# friendly wire name -> a value read straight out of a CHOP or DAT, with no
# parameter in between. One-way, TD -> web. The entry's shape picks the source and
# the wire type; `type` appears only where it overrides that.
#
# Both of these are CHOP readouts: this instance registers no DAT readout at all,
# which is what leaves it with `chopexec_…` watchers and no `datexec_…` ones.
#
# Full reference: packages/td-core/docs/touchdesigner-setup.md § Readouts.
READOUTS = {
    "fps": {
        "op": "/project1/readouts/null_stats",
        "chan": "fps",
    },
    "levels": {
        "op": "/project1/readouts/null_bands",
        "chan": ["low", "mid", "high"],
    },
}
