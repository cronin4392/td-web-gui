"""
webserverDAT callbacks — TD Web GUI control-data protocol.

Speaks the WebSocket wire contract the web app expects:

	hello             -> welcome
	snapshot-request  -> snapshot   (all exposed params)
	update            -> apply param writes
	pulse             -> fire a momentary param (par.pulse()), no reply
	ping              -> pong

Nothing here is project specific — drop this into any project unchanged. The
param map (REGISTRY) and the instance name are read from a Text DAT named
`config` beside this one; see td/config.py for what that DAT must define.
Friendly wire names are mapped there to (operator, parameter, wire-type), which
is the single place type info lives.

TD-side param edits are pushed back to the browser by a Parameter Execute DAT
that calls broadcast_param_change() — see td/parameter-execute.py.

See prds/TECH_PROPOSAL.md "WebSocket Wire Format" for the full message catalog.
"""
from typing import Any, Dict

import json

# Name of the Text DAT holding this project's configuration, looked up beside
# this DAT. The one thing this file needs to know about its project.
CONFIG = 'config'

# Wire protocol version, sent in the `welcome` reply.
PROTOCOL = 1

# Open WebSocket client connections, used for broadcast.
clients = set()

# Cached Web Server DAT so broadcast_param_change() can send from outside a
# callback (e.g. a Parameter Execute DAT). Set on every callback that has `dat`.
_server = None

# (op path, par name) pairs we've already warned about, so a project that's
# missing a backing operator/par doesn't spam the textport on every request.
_warned = set()


def _config():
	"""This project's config DAT module.

	Read fresh each time rather than cached, so editing the config DAT takes
	effect without re-cooking this one (TD caches the compiled module itself).
	"""
	dat = op(CONFIG)
	if dat is None:
		raise RuntimeError("webserver-callbacks: no DAT named '%s' beside this one - "
						   "paste td/config.py into a Text DAT with that name" % CONFIG)
	return dat.module


def _registry():
	return _config().REGISTRY


def _remember(dat):
	global _server
	_server = dat


def _warn_missing(entry, reason):
	key = (entry['op'], entry['par'])
	if key in _warned:
		return
	_warned.add(key)
	print("webserver-callbacks: warning - %s" % reason)


def _pars(entry):
	"""The backing par(s) for a registry entry, in wire order.

	Empty when that operator/parameter isn't in this project (rather than
	raising), so callers can skip/warn instead of crashing the whole snapshot.
	"""
	base = op(entry['op'])
	if base is None:
		_warn_missing(entry, "operator '%s' not found" % entry['op'])
		return []
	if entry['type'] == 'number[]':
		return list(base.pars(entry['par'] + '*'))
	par = getattr(base.par, entry['par'], None)
	if par is None:
		_warn_missing(entry, "operator '%s' has no par '%s'" % (entry['op'], entry['par']))
		return []
	return [par]


def _read(name):
	entry = _registry()[name]
	pars = _pars(entry)
	if entry['type'] == 'number[]':
		return [p.eval() for p in pars]
	value = pars[0].eval()
	if entry['type'] == 'bool':
		return bool(value)
	if entry['type'] == 'string' and hasattr(value, 'path'):
		# OP-reference pars (e.g. COMP-type custom pars) eval() to the operator
		# itself, not a string — send its path over the wire instead.
		return value.path
	return value


def _snapshot():
	# Pulses hold no state — never part of a snapshot/update. A registered par
	# whose op/par doesn't exist is left out rather than sent as null: the
	# browser drops unknown names anyway, and a project that only has some of
	# the backing operators wired up still syncs.
	result = {}
	for name, entry in _registry().items():
		if entry['type'] == 'pulse':
			continue
		if not _pars(entry):
			continue
		result[name] = _read(name)
	return result


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
	"""Apply a wire value to its backing parameter(s).

	Returns False when the backing par(s) don't exist in this project.
	"""
	entry = _registry()[name]
	pars = _pars(entry)
	if not pars:
		return False
	if entry['type'] == 'number[]':
		for p, v in zip(pars, value):
			p.val = v
	else:
		pars[0].val = value
	return True


def _pulse(name):
	"""Fire a momentary parameter (web -> TD only, no synced state).

	Returns False when the backing par doesn't exist in this project.
	"""
	pars = _pars(_registry()[name])
	if not pars:
		return False
	pars[0].pulse()
	return True


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
	for name, entry in _registry().items():
		if entry['type'] == 'pulse':
			continue
		if op(entry['op']) is not par.owner:
			continue
		matches = par.name.startswith(entry['par']) if entry['type'] == 'number[]' \
			else par.name == entry['par']
		if matches:
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
		_send(client, {'type': 'welcome', 'protocol': PROTOCOL,
					   'instance': _config().INSTANCE})

	elif mtype == 'snapshot-request':
		_send(client, {'type': 'snapshot', 'params': _snapshot()})

	elif mtype == 'update':
		for name, value in (message.get('params') or {}).items():
			entry = _registry().get(name)
			if entry is None:
				_send(client, {'type': 'error', 'code': 'unknown_param',
							   'message': "no param '%s'" % name, 'ref': name})
				continue
			if entry['type'] == 'pulse':
				_send(client, {'type': 'error', 'code': 'unknown_param',
							   'message': "'%s' is pulse-only, send a pulse message" % name,
							   'ref': name})
				continue
			# _write fires the Parameter Execute DAT, which broadcasts the change.
			if not _write(name, value):
				_send(client, {'type': 'error', 'code': 'missing_param',
							   'message': "param '%s' has no backing operator" % name,
							   'ref': name})

	elif mtype == 'pulse':
		name = message.get('name')
		entry = _registry().get(name)
		if entry is None or entry['type'] != 'pulse':
			_send(client, {'type': 'error', 'code': 'unknown_param',
						   'message': "no pulse param '%s'" % name, 'ref': name})
		elif not _pulse(name):
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
