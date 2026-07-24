"""
Parameter Execute DAT — TD -> web bridge.

Watches the backing operators and pushes each changed, registered parameter to
all connected browsers via the Web Server DAT's callbacks module. Edits that
arrive from the web flow through here too, because onWebSocketReceiveText sets
par.val — so this is the single broadcast path for both web- and TD-originated
changes.
"""

# ═════════════════════════════════════════════════════════════════════════════
# CONFIGURATION — the only part of this file that is project specific.
#
# Set on the DAT itself, not here:
#   OPs            every operator the callbacks DAT's REGISTRY references, space
#                  separated — a Parameter Execute DAT can watch several at once
#                  (e.g. `/GUI/ExternalScenes/Scene* /GUI/GUI`).
#   Value Change   enabled.
#   Custom         enabled.
# ═════════════════════════════════════════════════════════════════════════════

# Name of, or path to, the Web Server DAT's callbacks DAT. TD op names can't
# contain hyphens, so this won't literally be "webserver-callbacks".
CALLBACKS = 'webserver1_callbacks'


# ═════════════════════════════════════════════════════════════════════════════
# SHARED CODE — nothing below is project specific.
# ═════════════════════════════════════════════════════════════════════════════

from typing import Any, List


def _callbacks():
	dat = op(CALLBACKS)
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
