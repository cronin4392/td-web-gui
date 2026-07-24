"""
Parameter Execute DAT — TD -> web bridge.

Watches the backing operators and pushes each changed, registered parameter to
all connected browsers via the Web Server DAT's callbacks module. Edits that
arrive from the web flow through here too, because onWebSocketReceiveText sets
par.val — so this is the single broadcast path for both web- and TD-originated
changes.

Nothing here is project specific — drop this into any project unchanged. The
name of the callbacks DAT is read from a Text DAT named `config` beside this
one; see td/config.py for what that DAT must define.

Set on this DAT itself, since they're parameters rather than values that can be
read from the config DAT:
	OPs            every operator the config's REGISTRY references, space
	               separated — one Parameter Execute DAT can watch several at
	               once (e.g. `/GUI/ExternalScenes/Scene* /GUI/GUI`).
	Value Change   enabled.
	Custom         enabled.
"""

from typing import Any, List

# Name of the Text DAT holding this project's configuration, looked up beside
# this DAT. The one thing this file needs to know about its project.
CONFIG = 'config'


def _config():
	dat = op(CONFIG)
	if dat is None:
		raise RuntimeError("parameter-execute: no DAT named '%s' beside this one - "
						   "paste td/config.py into a Text DAT with that name" % CONFIG)
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
