"""
webserverDAT callbacks — TD Web GUI control-data protocol.

Speaks the WebSocket wire contract the web app expects:

	hello             -> welcome
	snapshot-request  -> menus (if any) then snapshot (all exposed params)
	menus-request     -> menus   (re-read; the web's "reload devices" action)
	update            -> apply param writes
	pulse             -> fire a momentary param (par.pulse()), no reply
	ping              -> pong
	rtc-offer         -> drive the WebRTC DAT to answer (video, Phase 5)
	rtc-answer        -> apply the browser's answer to a TD-initiated offer
	rtc-ice           -> add a remote ICE candidate

Param-scoped failures reply with an `error` carrying the offending name as
`ref`, and are never fatal to the socket:

	unknown_param         no such name in the registry, or the wrong message
	                      kind for it (an `update` aimed at a pulse param)
	missing_param         registered, but its operator/parameter isn't in this
	                      project
	param_not_writable    registered writable:False, or a backing par isn't in
	                      CONSTANT mode — see _refuse_write
	param_type_mismatch   the value doesn't fit the entry's declared wire type:
	                      wrong JSON type, wrong array length, unknown menu key

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
		# The ParGroup, not a pars('Color*') name glob. The glob was wrong twice
		# over: it also sweeps up unrelated pars that merely share the prefix (a
		# 'Colormode' sitting beside 'Colorr/g/b/a'), and it orders by the
		# operator's parameter list rather than by component. A ParGroup's own
		# order IS the fixed component order the wire array uses.
		group = base.parGroup[entry['par']]  # None when absent; .Name would raise
		if group is None:
			_warn_missing(entry, "operator '%s' has no ParGroup '%s'"
						  % (entry['op'], entry['par']))
			return []
		return list(group)
	par = getattr(base.par, entry['par'], None)
	if par is None:
		_warn_missing(entry, "operator '%s' has no par '%s'" % (entry['op'], entry['par']))
		return []
	return [par]


# ── wire-type coercion ────────────────────────────────────────────────────────
#
# The wire speaks only clean JSON types — bool / number / string / number[] —
# and TD does all the coercion, because the registry is where the type
# information already lives. An entry's declared type is a promise to the web
# app's TypeScript schema, so both directions coerce to it rather than passing
# TD's native value straight through and hoping it lines up.

class _WireTypeError(Exception):
	"""A value doesn't fit the wire type its registry entry declares.

	Raised in both directions — reading a String par registered as 'number', or a
	browser sending a string for a 'bool'. Never fatal: the caller turns it into a
	skipped snapshot entry (plus a warning) or a param-scoped `error` reply.
	"""


def _to_number(value, where):
	# bool is an int subclass in Python but serialises as JSON `true`, so letting
	# one through would reach the web as a boolean and break the schema's promise
	# that this name carries a number.
	if isinstance(value, bool):
		return int(value)
	if isinstance(value, (int, float)):
		return value
	raise _WireTypeError('%s expected a number, got %r' % (where, value))


def _to_bool(value, where):
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	# Deliberately not a plain bool(value): the string "false" is truthy, so a
	# loose cast would turn an off into an on.
	raise _WireTypeError('%s expected a boolean, got %r' % (where, value))


def _to_string(value, where):
	if isinstance(value, str):
		return value
	if hasattr(value, 'path'):
		# OP-reference pars (e.g. COMP-type custom pars) eval() to the operator
		# itself, not a string — send its path over the wire instead.
		return value.path
	if isinstance(value, (int, float)):
		return str(value)
	raise _WireTypeError('%s expected a string, got %r' % (where, value))


def _read(name):
	"""This param's current value, coerced to its declared wire type.

	Mode-agnostic by design: par.eval() returns the live evaluated value in every
	ParMode, so an expression-driven, exported or bound par reads correctly with
	no special handling at all. Only writes have to care about the mode.
	"""
	entry = _registry()[name]
	pars = _pars(entry)
	where = "param '%s'" % name
	if entry['type'] == 'number[]':
		return [_to_number(p.eval(), where) for p in pars]
	value = pars[0].eval()
	if entry['type'] == 'bool':
		return _to_bool(value, where)
	if entry['type'] == 'number':
		return _to_number(value, where)
	return _to_string(value, where)


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
		try:
			result[name] = _read(name)
		except _WireTypeError as e:
			# One mistyped registry entry must not cost the whole snapshot —
			# the browser would then never sync anything at all.
			_warn_missing(entry, str(e))
	return result


def _menus():
	"""Menu options for every registry entry whose backing par is a Menu.

	`{name: [{'value': key, 'label': label}]}` — the keys are what `update`
	carries, the labels are only for display.

	This is the one place TD is introspected on the web's behalf, and it exists
	for menus the web *cannot* author ahead of time: an Audio Device Out CHOP's
	device list depends on the machine TD is running on and changes when hardware
	is plugged in. A web-authored <Select options={...}> ignores all of this, so
	announcing costs projects that don't need it nothing.

	No registry field marks these — a par either has menuNames or it doesn't, and
	asking TD is more reliable than asking an author to remember. Restricted to
	'string' entries because Toggle pars also carry menuNames (['off','on']) while
	travelling the wire as bools, and announcing those would offer a dropdown for
	something rendered as a checkbox.
	"""
	result = {}
	for name, entry in _registry().items():
		if entry['type'] != 'string':
			continue
		pars = _pars(entry)
		if not pars:
			continue
		keys = getattr(pars[0], 'menuNames', None)
		if not keys:
			continue
		labels = getattr(pars[0], 'menuLabels', None) or keys
		result[name] = [{'value': k, 'label': l} for k, l in zip(keys, labels)]
	return result


# Last announced menu map, so the optional watcher below only broadcasts on a
# real change rather than every time it runs.
_last_menus = None


def broadcast_menus_if_changed():
	"""Re-announce menus to every client, but only when they've actually changed.

	Returns True if a broadcast went out, False if the menus were identical to
	the last announcement (and nothing was sent).

	Called from two places, for the same reason: TD has no event for a menu's
	*contents* changing. A Parameter Execute DAT fires on a par's value, mode,
	enable and export, but plugging in an audio interface changes none of those —
	the value is untouched, only the set of legal values grows. So there is
	nothing to subscribe to, and someone has to look again.

	Do NOT reach for a Parameter DAT (with Menu Names / Menu Labels output) plus a
	DAT Execute to get an event out of this. It looks like it should work and it
	does not: measured on 2025.33070, changing a par's menuNames fires
	onTableChange ZERO times, while changing that same par's *value* fires it once
	— so the wiring is fine and the menu change simply doesn't notify. Derivative
	logged this as a bug in April 2021 (forum.derivative.ca/t/breaking-binding-a-
	dropdown-menu-out-to-a-perform-ui/13123) and it is still open. The DAT's
	content is fresh whenever you pull it; what never arrives is the nudge to pull.

	1. **A `menus-request` from the browser** (a "reload devices" button). This is
	   the cheaper and more predictable of the two, because the person who just
	   plugged the device in is right there to ask.
	2. **An optional TD-side poll**, for menus that must refresh with nobody
	   watching. Wire it to an Execute DAT's onFrameStart, gated so it runs every
	   second or two rather than every frame — device changes are human-paced:

		   def onFrameStart(frame):
			   if absTime.frame % 120:   # ~2s at 60fps
				   return
			   op.WebGuiServer.op('webserver1_callbacks').module.broadcast_menus_if_changed()

	   Not wired up by default: it costs a menuNames read per registered menu par
	   per tick, forever, for something most projects never need.
	3. **Best, when it applies: the pulse that causes the change.** If a menu is
	   rebuilt by a TD action rather than by the OS — a Screen Grab TOP's Refresh
	   Sources, say — hook THAT pulse (a Parameter Execute DAT's onPulse) and call
	   this. It's a real event, so no poll and no button. Audio devices don't
	   qualify: the OS changes that list, not a par, which is why they use (1).

	The diff is what makes either safe to call freely — an unchanged list sends
	nothing, so no client is woken for a no-op.
	"""
	global _last_menus
	menus = _menus()
	if menus == _last_menus:
		return False
	_last_menus = menus
	_broadcast({'type': 'menus', 'menus': menus})
	return True


def _send(client, message):
	if _server is not None:
		_server.webSocketSendText(client, json.dumps(message))


def _broadcast(message):
	if _server is None:
		return
	text = json.dumps(message)
	for client in list(clients):
		_server.webSocketSendText(client, text)


def _report(client, name, problem):
	"""Send back a param-scoped `error` if a write/pulse refused, else nothing.

	`problem` is what _write/_pulse return: None, or an (code, message) pair. The
	`ref` is what lets the browser recover this one param — td-core keys its
	read-only marking and re-snapshot on it — so it is always carried.
	"""
	if problem is None:
		return
	code, detail = problem
	_send(client, {'type': 'error', 'code': code, 'message': detail, 'ref': name})


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
	assumption (see prds/TECH_PROPOSAL.md "Video at Scale"), and _handle_rtc_offer
	says so out loud when a second one negotiates.
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

	# Single-viewer is a v1 limit of the TOPs, not of the peer: each Video Stream
	# Out TOP holds ONE connection, so attach_streams below re-points this
	# project's TOPs at whoever negotiated last and the earlier browser's tiles
	# freeze on their final frame. Newest-wins is the predictable half of that (a
	# refresh always gets you video back); saying so is the other half, because
	# the victim sees no error at all — its peer stays happily `connected`.
	others = [c for c in peer_by_client if c != client]
	if others:
		print("webserver-callbacks: warning - %d other browser(s) already hold a "
			  "video peer; one Video Stream Out TOP serves one connection, so "
			  "this one takes the stream and theirs freezes. Serving both needs a "
			  "second set of TOPs." % len(others))
		_send(client, {'type': 'error', 'code': 'video_single_viewer',
					   'message': 'another browser was streaming; video moved to '
								  'this one and its tiles have frozen'})

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


def _refuse_write(name, entry, pars):
	"""Why a web write must not touch these pars, or None when it may.

	Two independent gates, both of which have to pass:

	1. The registry author marked the entry `writable: False` — a readout the web
	   is never meant to drive.
	2. Any backing par is in a mode other than CONSTANT.

	The second one matters more than "the write wouldn't take anyway", which is
	the intuition it's easy to have here. On 2025.33070, assigning par.val to an
	EXPRESSION- or EXPORT-mode par **flips that par into CONSTANT mode**, and the
	expression stops driving it for good — the text survives in par.expr, but
	nothing evaluates it any more. So an unguarded web write doesn't quietly fail;
	it detaches a TD author's expression, and the damage outlives the browser
	session that caused it.

	BIND is refused alongside them even though a two-way bind was observed to
	propagate the write to its master rather than break. It can't be assumed
	writable either, and refusing is the recoverable direction: the browser gets a
	visible error instead of silently driving something it may not own.

	Checked per component for arrays, so a half-constant ParGroup (Positionx
	constant, Positiony expression) is refused whole rather than half-applied.
	"""
	if not entry.get('writable', True):
		return "param '%s' is registered writable:False" % name
	stuck = [p for p in pars if p.mode != ParMode.CONSTANT]
	if stuck:
		return ("param '%s' is not web-writable: %s"
				% (name, ', '.join('%s is in %s mode' % (p.name, p.mode.name) for p in stuck)))
	return None


def _menu_checked(par, value, where):
	"""Reject a menu key TD doesn't have, rather than let it snap to entry 0.

	A Menu par assigned an unrecognised key raises nothing and silently takes its
	FIRST menu entry — and the Parameter Execute DAT then broadcasts that value
	back as though the user had picked it. <Select>'s options are authored on the
	web side by design (TD is never introspected), so drift between them and TD's
	menu is an expected failure rather than a freak one, and it earns a real error
	instead of a mystery jump to whatever happens to sort first.
	"""
	names = getattr(par, 'menuNames', None)
	if names and value not in names:
		# Truncated: a built-in menu can run to dozens of keys (blend mode has
		# 46), and this message travels over the wire to a console.
		offered = ', '.join(names[:12]) + (', ...' if len(names) > 12 else '')
		raise _WireTypeError("%s has no menu key '%s' - TD offers: %s"
							 % (where, value, offered))
	return value


def _coerce_in(name, entry, pars, value):
	"""A wire value as the list of values to assign, one per backing par."""
	where = "param '%s'" % name
	if entry['type'] == 'number[]':
		if not isinstance(value, (list, tuple)):
			raise _WireTypeError('%s expected an array of %d numbers, got %r'
								 % (where, len(pars), value))
		if len(value) != len(pars):
			# zip() would truncate here, half-applying a colour or an XYZ and
			# leaving no trace of why. A length mismatch means the web schema and
			# the registry have drifted apart, which is worth saying out loud.
			raise _WireTypeError('%s expects %d components (%s), got %d'
								 % (where, len(pars), ', '.join(p.name for p in pars),
									len(value)))
		return [_to_number(v, where) for v in value]
	if entry['type'] == 'bool':
		return [_to_bool(value, where)]
	if entry['type'] == 'number':
		return [_to_number(value, where)]
	return [_menu_checked(pars[0], _to_string(value, where), where)]


def _write(name, value):
	"""Apply a wire value to its backing parameter(s).

	Returns None on success, or an (error code, message) pair for the caller to
	send back as a param-scoped `error`.
	"""
	entry = _registry().get(name)
	if entry is None:
		return 'unknown_param', "no param '%s'" % name
	if entry['type'] == 'pulse':
		return 'unknown_param', "'%s' is pulse-only, send a pulse message" % name
	pars = _pars(entry)
	if not pars:
		return 'missing_param', "param '%s' has no backing operator" % name
	refusal = _refuse_write(name, entry, pars)
	if refusal is not None:
		return 'param_not_writable', refusal
	try:
		values = _coerce_in(name, entry, pars, value)
	except _WireTypeError as e:
		return 'param_type_mismatch', str(e)
	# Every component is coerced before any is assigned, so a bad third component
	# can't leave the first two already written to the project.
	for par, coerced in zip(pars, values):
		par.val = coerced
	return None


def _pulse(name):
	"""Fire a momentary parameter (web -> TD only, no synced state).

	Returns None on success, or an (error code, message) pair.

	No mode guard here, unlike _write: par.pulse() leaves the mode alone (checked
	on 2025.33070 — an EXPRESSION-mode par is still in EXPRESSION mode after a
	pulse), so it can't detach an expression the way par.val does. The registry's
	writable flag is still honoured, since that one is the author saying "the web
	does not drive this", regardless of mechanism.
	"""
	entry = _registry().get(name)
	if entry is None or entry['type'] != 'pulse':
		return 'unknown_param', "no pulse param '%s'" % name
	if not entry.get('writable', True):
		return 'param_not_writable', "param '%s' is registered writable:False" % name
	pars = _pars(entry)
	if not pars:
		return 'missing_param', "param '%s' has no backing operator" % name
	pars[0].pulse()
	return None


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
		# Matched against the group's actual components rather than by name
		# prefix: a 'Colormode' par changing must not be mistaken for a component
		# of the 'Color' ParGroup and broadcast as one.
		matches = any(p.name == par.name for p in _pars(entry)) \
			if entry['type'] == 'number[]' else par.name == entry['par']
		if matches:
			try:
				value = _read(name)
			except _WireTypeError as e:
				_warn_missing(entry, str(e))
				return
			_broadcast({'type': 'update', 'params': {name: value}})
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
		# Menus first, then values. A <Select> that received its value before the
		# options it belongs to would briefly have nothing to match it against and
		# render as though TD had selected nothing.
		#
		# Answered here rather than after `welcome` so the browser re-learns the
		# menus on every reconnect and resync — which is also how a device list
		# that changed while the socket was down gets picked up.
		menus = _menus()
		if menus:
			_send(client, {'type': 'menus', 'menus': menus})
		_send(client, {'type': 'snapshot', 'params': _snapshot()})

	elif mtype == 'update':
		for name, value in (message.get('params') or {}).items():
			# A successful _write fires the Parameter Execute DAT, which
			# broadcasts the change on to every client.
			_report(client, name, _write(name, value))

	elif mtype == 'pulse':
		name = message.get('name')
		_report(client, name, _pulse(name))

	elif mtype == 'menus-request':
		# A "reload devices" button. Re-reads the menus and broadcasts if they
		# really changed, so *every* client learns about the new device — not just
		# whoever clicked. When nothing changed the broadcast is skipped, so the
		# requester is answered directly; either way it gets exactly one reply and
		# the button always has a definite result.
		if not broadcast_menus_if_changed():
			_send(client, {'type': 'menus', 'menus': _menus()})

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
