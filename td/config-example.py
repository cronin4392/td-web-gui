"""
Project configuration for the TD Web GUI bridge — the reference project
(td/Example.toe, driving apps/example). One registry entry per control kind in
that app, so every control there has a working backing par.

Everything project specific lives here. td/webserver-callbacks.py and
td/parameter-execute.py are drop-in copies that read these values back out via
op('config').module, so this is the only file you edit per project.

Setup: paste this into a Text DAT named `config`, beside the Web Server DAT's
callbacks DAT and the Parameter Execute DAT.

Backing operators this project expects — a single `params` Base COMP with one
custom par per REGISTRY entry:
	Message    String
	Intensity  Float   (0-1)
	Enabled    Toggle
	Reset      Pulse
	Gate       Toggle
	Mute       Toggle
	Blendmode  Menu    (menu keys must match apps/example's Select options)
	Position   XYZ     (Float) -> Positionx/Positiony/Positionz
	Color      RGBA    (Float, 0-1) -> Colorr/Colorg/Colorb/Colora

Set by hand, because they're parameters on the DATs rather than values read
from here:
	Parameter Execute DAT   OPs = `params`, Value Change and Custom enabled.
	                        (Pulse pars don't raise Value Change, so `reset`
	                        never needs to broadcast.)
	Web Server DAT          Callbacks DAT = the callbacks DAT named below.
"""

# Name of, or path to, the Web Server DAT's callbacks DAT — the Parameter
# Execute DAT reads this to find the module it broadcasts through. TD op names
# can't contain hyphens, so this won't literally be "webserver-callbacks".
CALLBACKS = 'webserver1_callbacks'

# Identifies this TD project to the web app, sent in the `welcome` reply.
INSTANCE = 'example'

# friendly wire name -> backing parameter.
#   type: 'bool' | 'number' | 'string' | 'number[]' | 'pulse'
#     - 'number[]' entries reference the ParGroup's base name (e.g. 'Position'
#       for the tuple pars 'Positionx'/'Positiony'/'Positionz'); component
#       order there is the wire array order.
#     - 'pulse' entries hold no state: excluded from snapshot, written via a
#       dedicated `pulse` message (not `update`), and call par.pulse().
REGISTRY = {
	'message':   {'op': 'params', 'par': 'Message',   'type': 'string'},
	'intensity': {'op': 'params', 'par': 'Intensity', 'type': 'number'},
	'enabled':   {'op': 'params', 'par': 'Enabled',   'type': 'bool'},
	'reset':     {'op': 'params', 'par': 'Reset',     'type': 'pulse'},
	'gate':      {'op': 'params', 'par': 'Gate',      'type': 'bool'},
	'mute':      {'op': 'params', 'par': 'Mute',      'type': 'bool'},
	'blendmode': {'op': 'params', 'par': 'Blendmode', 'type': 'string'},
	'position':  {'op': 'params', 'par': 'Position',  'type': 'number[]'},
	'color':     {'op': 'params', 'par': 'Color',     'type': 'number[]'},
}
