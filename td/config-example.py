"""
Project configuration for the TD Web GUI bridge — the reference project
(td/Example.toe, driving apps/example). One registry entry per control kind in
that app, so every control there has a working backing par.

The param map lives here. td/webserver-callbacks.py and td/parameter-execute.py
are drop-in copies that read it back out via op.WebGuiServer.op('config').module.

Setup: point the WebGuiServer component's Config File par at this file — it
loads it into the `config` Text DAT the two scripts read. The instance name the
web app sees is WebGuiServer's Identifier par, not a value in this file.

Backing operators this project expects — a single `/project1/params` Base COMP
with one custom par per REGISTRY entry:
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
	Parameter Execute DAT   OPs = `/project1/params`, Value Change and Custom
	                        enabled. (Pulse pars don't raise Value Change, so
	                        `reset` never needs to broadcast.)
	Web Server DAT          Callbacks DAT = the callbacks DAT named below;
	                        Port = `op.WebGuiServer.par.Port`.
"""

# The Web Server DAT's callbacks DAT — the Parameter Execute DAT reads this to
# find the module it broadcasts through. Resolved relative to that DAT, so give
# an absolute path unless the two sit side by side inside WebGuiServer. TD op
# names can't contain hyphens, so this won't literally be "webserver-callbacks".
CALLBACKS = 'webserver1_callbacks'

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
REGISTRY = {
	'message':   {'op': '/project1/params', 'par': 'Message',   'type': 'string'},
	'intensity': {'op': '/project1/params', 'par': 'Intensity', 'type': 'number'},
	'enabled':   {'op': '/project1/params', 'par': 'Enabled',   'type': 'bool'},
	'reset':     {'op': '/project1/params', 'par': 'Reset',     'type': 'pulse'},
	'gate':      {'op': '/project1/params', 'par': 'Gate',      'type': 'bool'},
	'mute':      {'op': '/project1/params', 'par': 'Mute',      'type': 'bool'},
	'blendmode': {'op': '/project1/params', 'par': 'Blendmode', 'type': 'string'},
	'position':  {'op': '/project1/params', 'par': 'Position',  'type': 'number[]'},
	'color':     {'op': '/project1/params', 'par': 'Color',     'type': 'number[]'},
}
