"""
td-core project config — copy this file into your project and edit it.

This is the ONE file you write per project. The other three scripts in this
folder are project-agnostic and are dropped in unchanged:

	webserver-callbacks.py   Web Server DAT callbacks  (params + inbound signaling)
	parameter-execute.py     Parameter Execute DAT     (TD -> web broadcast)
	webrtc-callbacks.py      WebRTC DAT callbacks      (outbound video signaling)

All three find this file through the WebGuiServer component's `Config File`
parameter, which loads it into a Text DAT named `config` inside the component.
They read it back as `op.WebGuiServer.op('config').module`.

The instance name the web app sees comes from WebGuiServer's `Identifier`
parameter, not from anything in here.

See docs/touchdesigner-setup.md for the full walkthrough.
"""

# ── Wiring ───────────────────────────────────────────────────────────────────

# Name of the Web Server DAT's callbacks DAT. The Parameter Execute DAT reads
# this to find the module it broadcasts through.
#
# Resolved from *inside* WebGuiServer by both scripts, so a bare name is correct
# when the DAT sits in the component. Use an absolute path if it lives elsewhere.
# TD operator names can't contain hyphens, so this won't literally be
# "webserver-callbacks".
CALLBACKS = 'webserver1_callbacks'


# ── Parameters ───────────────────────────────────────────────────────────────

# friendly wire name -> backing parameter.
#
#   op:   Absolute path to the operator, e.g. '/project1/params'.
#         WebGuiServer is a global operator that can live anywhere, and these
#         lookups run from inside it — so a bare name resolves against the
#         component, not against your project. Always use an absolute path.
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
#         web — it still snapshots and broadcasts, but a write is refused with a
#         `param_not_writable` error instead of applied. Use it for readouts the
#         browser must never drive.
#
#         Note this flag is NOT sent to the web. The web authors its own
#         read-only set beside its TypeScript schema; this is the TD-side
#         backstop. A par in EXPRESSION/EXPORT/BIND mode is refused whether or
#         not it's flagged, so you only need this for a CONSTANT par you want to
#         keep TD-driven.
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


# ── Video (optional) ─────────────────────────────────────────────────────────

# The WebRTC DAT, as a bare name when it sits inside WebGuiServer beside the
# callbacks DAT (these lookups run from in there), or an absolute path otherwise.
#
# Leave as None for a params-only project: the signaling branches then reply with
# a clear error instead of raising, and nothing on the parameter side is affected.
WEBRTC = None

# friendly stream id -> the Video Stream Out TOP carrying it.
#
#   top:   Absolute path to a Video Stream Out TOP in WebRTC mode.
#   label: Optional human-readable name, passed through to the browser.
#
# The id is what `<Video stream="...">` selects on. The `mid` pairing an id to a
# track is derived from the negotiated SDP, not authored here. A bare `<Video />`
# takes the first entry, so the first stream is the single-stream default.
#
# **Insertion order is load-bearing.** webrtc-callbacks.py zips this dict against
# the video m-lines of the negotiated SDP in order, so reordering these entries
# reassigns which id names which track.
#
# One Video Stream Out TOP serves ONE peer — its WebRTC Connection parameter
# holds a single value — so N entries here are N streams for ONE browser, not one
# stream for N browsers. See docs/touchdesigner-setup.md § Video for the
# single-viewer limit.
STREAMS = {
	# 'main': {'top': '/project1/videostreamout1', 'label': 'Main'},
}
