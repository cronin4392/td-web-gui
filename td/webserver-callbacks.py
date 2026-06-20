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

# friendly wire name -> backing parameter.
#   type: 'bool' | 'number' | 'string' | 'number[]'
REGISTRY = {
	'message':   {'op': 'params', 'par': 'Message',   'type': 'string'},
	'intensity': {'op': 'params', 'par': 'Intensity', 'type': 'number'},
}

# Open WebSocket client connections, used for broadcast.
clients = set()

# Cached Web Server DAT so broadcast_param_change() can send from outside a
# callback (e.g. a Parameter Execute DAT). Set on every callback that has `dat`.
_server = None


def _remember(dat):
	global _server
	_server = dat


def _par(entry):
	return op(entry['op']).par[entry['par']]


def _read(name):
	entry = REGISTRY[name]
	value = _par(entry).eval()
	return bool(value) if entry['type'] == 'bool' else value


def _snapshot():
	return {name: _read(name) for name in REGISTRY}


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
	"""Apply a wire value to its backing parameter (Phase 2: scalars only)."""
	_par(REGISTRY[name]).val = value


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
			_write(name, value)  # fires the Parameter Execute DAT -> broadcast

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
# 1. Create a `params` Base COMP with custom pars `Message` (String) and
#    `Intensity` (Float, 0-1) — the operators REGISTRY points at.
# 2. Add a Parameter Execute DAT, set its OP to `params`, enable Value Change
#    and Custom, and use this body (replace 'webserver_callbacks' with the
#    actual name of THIS callbacks DAT — TD op names can't contain hyphens):
#
#        def onValueChange(par, prev):
#            op('webserver_callbacks').module.broadcast_param_change(par)
#            return
# ─────────────────────────────────────────────────────────────────────────────
