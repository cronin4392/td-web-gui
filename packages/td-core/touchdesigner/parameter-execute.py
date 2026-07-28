"""
Parameter Execute DAT — TD -> web bridge.

Watches the backing operators and pushes each changed, registered parameter to
all connected browsers via the Web Server DAT's callbacks module. Edits that
arrive from the web flow through here too, since onWebSocketReceiveText sets
par.val — so this is the single broadcast path for both web- and TD-originated
changes.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates one
Parameter Execute DAT per operator the REGISTRY references, resolved inside
the component's Td Core Dir par so editing this file hot-reloads all of them.

Only onValueChange is implemented. Pulses raise On Pulse rather than Value
Change and carry no state to broadcast, so pulse entries get no watcher at all.
"""

from typing import Any, List


def _webgui():
    """The WebGuiServer component, via its global OP shortcut."""
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "parameter-execute: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
        )
    return comp


def _config():
    dat = _webgui().op("config")
    if dat is None:
        raise RuntimeError(
            "parameter-execute: WebGuiServer has no 'config' DAT - check its Config File parameter"
        )
    return dat.module


def _callbacks():
    name = _config().CALLBACKS
    dat = _webgui().op(name)
    if dat is None:
        raise RuntimeError(
            "parameter-execute: WebGuiServer has no DAT '%s' - "
            "check CALLBACKS in the config DAT" % name
        )
    return dat.module


def onValueChange(par: Par, prev: Any):
    _callbacks().broadcast_param_change(par)
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
