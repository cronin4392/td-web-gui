"""
webserverDAT callbacks — TD Web GUI control-data protocol (Phase 2 subset).

Speaks the WebSocket wire contract the web app expects:

	hello             -> welcome
	snapshot-request  -> snapshot   (all exposed params)
	update            -> apply param writes
	ping              -> pong

Friendly wire names are mapped to (operator, parameter, wire-type) by REGISTRY,
which is the single place type info lives. TD-side param edits are pushed back to
the browser by a Parameter Execute DAT that calls broadcast_param_change()
(snippet at the bottom of this file).

See prds/TECH_PROPOSAL.md "WebSocket Wire Format" for the full message catalog.
"""
from typing import Any, Dict

import json

PROTOCOL = 1
INSTANCE = 'example'

# The eight external scene loaders. Each exposes the same pair of text pars; the
# web app shows only the pair belonging to the loader `selectedLoader` points at.
SCENE_IDS = 'ABCDEFGH'
SCENE_PATH = '/GUI/ExternalScenes/Scene%s'

# friendly wire name -> backing parameter.
#   type: 'bool' | 'number' | 'string' | 'number[]'
REGISTRY = {
	# 'message':   {'op': 'params',      'par': 'Message',   'type': 'string'},
	# 'intensity': {'op': 'params',      'par': 'Intensity', 'type': 'number'},
	'selectedLoader': {'op': '/GUI/GUI', 'par': 'Selectedloader', 'type': 'string'},
}

# sceneAText1 / sceneAText2 … sceneHText1 / sceneHText2. The web app derives these
# same names from its scene id, so the two sides must agree on the spelling.
for _scene in SCENE_IDS:
	REGISTRY['scene%sText1' % _scene] = {'op': SCENE_PATH % _scene, 'par': 'Text', 'type': 'string'}
	REGISTRY['scene%sText2' % _scene] = {'op': SCENE_PATH % _scene, 'par': 'Text2', 'type': 'string'}

# Open WebSocket client connections, used for broadcast.
clients = set()

# Cached Web Server DAT so broadcast_param_change() can send from outside a
# callback (e.g. a Parameter Execute DAT). Set on every callback that has `dat`.
_server = None


def _remember(dat):
	global _server
	_server = dat


def _par(entry):
	"""Backing Par, or None when that operator/parameter isn't in this project."""
	owner = op(entry['op'])
	if owner is None:
		return None
	return getattr(owner.par, entry['par'], None)


def _read(name):
	entry = REGISTRY[name]
	value = _par(entry).eval()
	if entry['type'] == 'bool':
		return bool(value)
	if entry['type'] == 'string' and hasattr(value, 'path'):
		# OP-reference pars (e.g. COMP-type custom pars) eval() to the operator
		# itself, not a string — send its path over the wire instead.
		return value.path
	return value


def _snapshot():
	# A registered par whose op/par doesn't exist is left out of the snapshot
	# rather than sent as null: the browser drops unknown names anyway, and a
	# project that only has some of the eight scene loaders wired up still syncs.
	return {name: _read(name) for name in REGISTRY if _par(REGISTRY[name]) is not None}


def _send(client, message):
	if _server is not None:
		_server.webSocketSendText(client, json.dumps(message))


def _broadcast(message):
	if _server is None:
		return
	text = json.dumps(message)
	for client in list(clients):
		_server.webSocketSendText(client, text)


def _write(name, value):
	"""Apply a wire value to its backing parameter (Phase 2: scalars only).

	Returns False when the backing par doesn't exist in this project.
	"""
	par = _par(REGISTRY[name])
	if par is None:
		return False
	par.val = value
	return True


def broadcast_param_change(par):
	"""
	Push a single TD-side parameter change to all connected browsers.

	Call this from a Parameter Execute DAT watching the backing operators, so an
	edit made inside TD (or by another client) reflects in every browser. Edits
	that arrive from the web also flow through here, because onWebSocketReceiveText
	sets par.val, which fires the Parameter Execute DAT — one uniform broadcast
	path. The originating browser ignores its own echo while the input is focused.
	"""
	for name, entry in REGISTRY.items():
		if op(entry['op']) is par.owner and entry['par'] == par.name:
			_broadcast({'type': 'update', 'params': {name: _read(name)}})
			return


# return the response dictionary
def onHTTPRequest(dat: webserverDAT, request: Dict[str, Any],
				  response: Dict[str, Any]) -> Dict[str, Any]:
	response['statusCode'] = 200  # OK
	response['statusReason'] = 'OK'
	response['data'] = '<b>TouchDesigner: </b>' + dat.name
	return response


def onWebSocketOpen(dat: webserverDAT, client: str, uri: str):
	_remember(dat)
	clients.add(client)
	return


def onWebSocketClose(dat: webserverDAT, client: str):
	clients.discard(client)
	return


def onWebSocketReceiveText(dat: webserverDAT, client: str, data: str):
	_remember(dat)

	try:
		message = json.loads(data)
	except Exception:
		return  # malformed frame: drop it, keep the socket up

	mtype = message.get('type')

	if mtype == 'hello':
		_send(client, {'type': 'welcome', 'protocol': PROTOCOL, 'instance': INSTANCE})

	elif mtype == 'snapshot-request':
		_send(client, {'type': 'snapshot', 'params': _snapshot()})

	elif mtype == 'update':
		for name, value in (message.get('params') or {}).items():
			if name not in REGISTRY:
				_send(client, {'type': 'error', 'code': 'unknown_param',
							   'message': "no param '%s'" % name, 'ref': name})
				continue
			# _write fires the Parameter Execute DAT, which broadcasts the change.
			if not _write(name, value):
				_send(client, {'type': 'error', 'code': 'missing_param',
							   'message': "param '%s' has no backing operator" % name,
							   'ref': name})

	elif mtype == 'ping':
		_send(client, {'type': 'pong'})

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


# ─────────────────────────────────────────────────────────────────────────────
# TD -> web: add a Parameter Execute DAT to push TD-side edits to the browser.
#
# 1. Create the operators REGISTRY points at:
#      - `/GUI/ExternalScenes/SceneA` … `SceneH`, each with custom pars `Text`
#        (String) and `Text2` (String)
#      - `/GUI/GUI` with the `Selectedloader` custom par
# 2. Add a Parameter Execute DAT, set its OPs to
#    `/GUI/ExternalScenes/Scene* /GUI/GUI` (space-separated OP pattern —
#    Parameter Execute DATs can watch several operators at once), enable Value
#    Change and Custom, and use this body (replace
#    'webserver_callbacks' with the actual name of THIS callbacks DAT — TD op
#    names can't contain hyphens):
#
#        def onValueChange(par, prev):
#            op('webserver_callbacks').module.broadcast_param_change(par)
#            return
# ─────────────────────────────────────────────────────────────────────────────
