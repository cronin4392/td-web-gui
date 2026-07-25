"""
webserverDAT callbacks — TD Web GUI control-data protocol.

Speaks the WebSocket wire contract the web app expects:

	hello             -> welcome
	snapshot-request  -> snapshot   (all exposed params)
	update            -> apply param writes
	pulse             -> fire a momentary param (par.pulse()), no reply
	ping              -> pong
	rtc-offer         -> drive the WebRTC DAT to answer (video, Phase 5)
	rtc-answer        -> apply the browser's answer to a TD-initiated offer
	rtc-ice           -> add a remote ICE candidate

WebRTC signaling is multiplexed over this same socket — one connection to
manage, no second port. The outbound half (answers, local ICE, the `streams`
map) lives in td/webrtc-callbacks.py, which reaches back here through
send_signaling() because this module is the one that owns the client sockets.

Nothing here is project specific — drop this into any project unchanged.
Everything project specific comes from the WebGuiServer component, reached by
its global OP shortcut:

	Identifier    names this instance to the web app.
	Config File   loaded into op.WebGuiServer.op('config'); its REGISTRY maps
	              friendly wire names to (operator, parameter, wire-type), the
	              single place type info lives. See td/config.py.

TD-side param edits are pushed back to the browser by a Parameter Execute DAT
that calls broadcast_param_change() — see td/parameter-execute.py.

See prds/TECH_PROPOSAL.md "WebSocket Wire Format" for the full message catalog.
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

# (op path, par name) pairs we've already warned about, so a project that's
# missing a backing operator/par doesn't spam the textport on every request.
_warned = set()


def _webgui():
	"""The WebGuiServer component, via its global OP shortcut.

	A shortcut rather than a path, so this file resolves it wherever it's dropped.
	"""
	comp = getattr(op, 'WebGuiServer', None)
	if comp is None:
		raise RuntimeError("webserver-callbacks: no global OP shortcut 'WebGuiServer' - "
						   "set one on the component holding the config DAT")
	return comp


def _config():
	"""This project's config DAT module, loaded from WebGuiServer's Config File par.

	Read fresh each time rather than cached, so repointing Config File (or editing
	the file) takes effect without re-cooking this DAT — TD caches the compiled
	module itself, so this costs an op lookup.
	"""
	dat = _webgui().op('config')
	if dat is None:
		raise RuntimeError("webserver-callbacks: WebGuiServer has no 'config' DAT - "
						   "check its Config File parameter")
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
		# A bare name is the likely culprit: this runs inside WebGuiServer, so
		# relative lookups resolve against the component, not the project root.
		hint = '' if entry['op'].startswith('/') else ' - REGISTRY paths should be absolute'
		_warn_missing(entry, "operator '%s' not found%s" % (entry['op'], hint))
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


# ── WebRTC signaling (Phase 5) ────────────────────────────────────────────────

def _webrtc():
	"""The project's WebRTC DAT, as `(dat, problem)`.

	`dat` is None when video isn't usable and `problem` says which of two very
	different causes it was: video not configured at all, versus WEBRTC naming an
	operator that isn't there. Those need opposite fixes, so collapsing both into
	one "no video" error sends you looking in the wrong place.
	"""
	name = getattr(_config(), 'WEBRTC', None)
	if not name:
		return None, 'this project exposes no video - set WEBRTC in the config DAT'
	dat = op(name)
	if dat is None:
		# Same trap as REGISTRY paths: these lookups run from inside WebGuiServer,
		# so a bare name resolves against the component, not the project root.
		hint = '' if name.startswith('/') else \
			" - a bare name resolves inside WebGuiServer; use an absolute path if it lives elsewhere"
		return None, "config WEBRTC names '%s', which doesn't exist%s" % (name, hint)
	return dat, None


def _streams():
	return getattr(_config(), 'STREAMS', {})


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
	print("webserver-callbacks: warning - %s (%s) has no par '%s'\n  its pars are: %s"
		  % (owner.path, owner.OPType, name, sorted(p.name for p in owner.pars('*'))))
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
		if not webrtc.addTrack(connection, stream_id, 'video'):
			print("webserver-callbacks: warning - addTrack failed for '%s' on %s"
				  % (stream_id, connection))


def attach_streams(connection):
	"""Point every configured Video Stream Out TOP at this peer's track.

	Public because the deferred `run()` below has to name something.

	Deferred by a frame: the TOP's WebRTC parameters are *menus* populated from
	the DAT — setting `webrtc` fills the connection menu, and setting
	`webrtcconnection` fills the track menu — so the values can't be selected
	until the DAT has cooked and published them. This only governs which TOP
	feeds pixels into the track; the SDP was already settled by _add_tracks.

	One TOP carries one connection, so a second browser connecting re-points the
	same TOP and takes the stream away from the first. Serving several browsers
	at once needs one Video Stream Out TOP per client; single-viewer is the v1
	assumption (see prds/TECH_PROPOSAL.md "Video at Scale").
	"""
	webrtc, _ = _webrtc()
	if webrtc is None or connection not in client_by_peer:
		return  # browser went away during the wait

	for stream_id, info in _streams().items():
		top = op(info['top'])
		if top is None:
			print("webserver-callbacks: warning - stream '%s' has no TOP at '%s'"
				  % (stream_id, info['top']))
			continue
		# Lowercase: these are built-in pars. (Custom pars are capitalized — see
		# REGISTRY — which is not the same convention.)
		if str(top.par.mode.eval()).lower() != 'webrtc':
			# Left as a warning rather than forced: the TOP's Mode is the user's
			# authoring choice, and silently rewriting it would hide a mis-wire.
			print("webserver-callbacks: warning - %s Mode is '%s', not 'webrtc'; "
				  "it will negotiate but send no video"
				  % (top.path, top.par.mode.eval()))
		_set_par(top, 'webrtc', webrtc)
		_set_par(top, 'webrtcconnection', connection)
		# Audio is out of scope for v1, so only the video track is claimed.
		_set_par(top, 'webrtcvideotrack', stream_id)


def _attach_streams_next_frame(connection):
	# run() executes its script detached from this module, so the callbacks DAT
	# is addressed by absolute path rather than the config's bare name.
	dat = op(_config().CALLBACKS)
	if dat is None:
		attach_streams(connection)  # no way to defer; try it inline
		return
	run('op(%r).module.attach_streams(%r)' % (dat.path, connection), delayFrames=1)


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

	Called by td/webrtc-callbacks.py, which has the WebRTC DAT's local SDP and
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
		_send(client, {'type': 'error', 'code': 'video_unavailable', 'message': problem})
		print('webserver-callbacks: %s' % problem)
		return
	if not _streams():
		# A peer with no tracks negotiates cleanly and then shows nothing, which
		# is far harder to diagnose than being told up front.
		print("webserver-callbacks: warning - WEBRTC is set but STREAMS is empty, "
			  "so the peer will carry no video")

	_close_peer(client)
	connection = webrtc.openConnection()
	peer_by_client[client] = connection
	client_by_peer[connection] = client

	# Order is load-bearing: tracks must exist before the answer is built, or its
	# video m-line comes back `a=inactive`. Pointing the TOPs at those tracks is
	# a separate, deferred step — it feeds pixels and doesn't touch the SDP.
	_add_tracks(webrtc, connection)
	webrtc.setRemoteDescription(connection, 'offer', sdp)
	webrtc.createAnswer(connection)
	_attach_streams_next_frame(connection)


def _handle_rtc_answer(client, sdp):
	"""Apply the browser's answer to an offer TD initiated (a track change)."""
	webrtc, _ = _webrtc()
	connection = peer_by_client.get(client)
	if webrtc is None or connection is None:
		return
	webrtc.setRemoteDescription(connection, 'answer', sdp)


def _handle_rtc_ice(client, message):
	"""Add a remote ICE candidate.

	`candidate: null` is end-of-candidates and carries no m-line association, so
	it is dropped rather than forwarded — TD finishes checking on its own, and
	there is no addIceCandidate(None) to call.
	"""
	webrtc, _ = _webrtc()
	connection = peer_by_client.get(client)
	candidate = message.get('candidate')
	if webrtc is None or connection is None or not candidate:
		return
	# Argument order is the DAT's: candidate, line index, then mid.
	webrtc.addIceCandidate(connection, candidate,
						   message.get('sdpMLineIndex'), message.get('sdpMid'))


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
	owner = par.owner
	for name, entry in _registry().items():
		if entry['type'] == 'pulse':
			continue
		# Compared by id, not by `is`. TD hands out fresh Python wrapper objects
		# for its internals (documented for Par: `p is p` is always False), so
		# identity is not a safe way to ask "same operator". id is stable for the
		# life of the node.
		target = op(entry['op'])
		if target is None or target.id != owner.id:
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

	mtype = message.get('type')

	if mtype == 'hello':
		_send(client, {'type': 'welcome', 'protocol': PROTOCOL,
					   'instance': _webgui().par.Identifier.eval()})

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

	elif mtype == 'rtc-offer':
		_handle_rtc_offer(client, message.get('sdp'))

	elif mtype == 'rtc-answer':
		_handle_rtc_answer(client, message.get('sdp'))

	elif mtype == 'rtc-ice':
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
