"""
Parameter Execute DAT — TD -> web bridge.

Watches the backing operators and pushes each changed, registered parameter to
all connected browsers via the Web Server DAT's callbacks module. Edits that
arrive from the web flow through here too, because onWebSocketReceiveText sets
par.val — so this is the single broadcast path for both web- and TD-originated
changes.

Nothing here is project specific — drop this into any project unchanged. The
name of the callbacks DAT comes from CALLBACKS in the config DAT, which the
WebGuiServer component loads from its Config File par; see td/config.py.

Set on this DAT itself, since they're parameters rather than values that can be
read from the config DAT:
	OPs            every operator the config's REGISTRY references, space
	               separated — one Parameter Execute DAT can watch several at
	               once (e.g. `/GUI/ExternalScenes/Scene* /GUI/GUI`).
	Value Change   enabled.
	Custom         enabled.
"""

from typing import Any, List


def _webgui():
	"""The WebGuiServer component, via its global OP shortcut.

	A shortcut rather than a path, so this file resolves it wherever it's dropped.
	"""
	comp = getattr(op, 'WebGuiServer', None)
	if comp is None:
		raise RuntimeError("parameter-execute: no global OP shortcut 'WebGuiServer' - "
						   "set one on the component holding the config DAT")
	return comp


def _config():
	dat = _webgui().op('config')
	if dat is None:
		raise RuntimeError("parameter-execute: WebGuiServer has no 'config' DAT - "
						   "check its Config File parameter")
	return dat.module


def _callbacks():
	dat = op(_config().CALLBACKS)
	return dat.module if dat is not None else None


def onValueChange(par: Par, prev: Any):
	cb = _callbacks()
	if cb is not None:
		cb.broadcast_param_change(par)
	return


def onValuesChanged(changes: List[ParChange]):
	return


def onPulse(par: Par):
	return


def onExpressionChange(par: Par, val: str, prev: str):
	return


def onExportChange(par: Par, val: str, prev: str):
	return


def onEnableChange(par: Par, val: bool, prev: bool):
	return


def onModeChange(par: Par, val: ParMode, prev: ParMode):
	return
