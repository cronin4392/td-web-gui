"""
Parameter Execute DAT — TD -> web bridge.

Watches the backing operators and pushes each changed, registered parameter to
all connected browsers via the Web Server DAT's callbacks module. Edits that
arrive from the web flow through here too, because onWebSocketReceiveText sets
par.val — so this is the single broadcast path for both web- and TD-originated
changes.

Setup: set this DAT's OPs parameter to `/GUI/ExternalScenes/Scene* /GUI/GUI`
(every operator REGISTRY references) and enable the "Value Change" and "Custom"
toggles.
"""

from typing import Any, List

# Name of the Web Server DAT's callbacks DAT. TD op names can't contain hyphens,
# so this won't literally be "webserver-callbacks" — set it to the actual name.
CALLBACKS = 'webserver1_callbacks'

def _callbacks():
	# dat = op(CALLBACKS)
	dat = op.WebGui.op('webserver1_callbacks')
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
