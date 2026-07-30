"""
CHOP Execute DAT — TD -> web bridge for CHOP-backed readouts.

Watches the CHOPs named by the config's READOUTS and tells the Web Server DAT's
callbacks module which channel moved. Readouts are one-way; a web `update`
aimed at one is refused by webserver-callbacks with `param_not_writable`.

Nothing here is project specific — drop this into any project unchanged. You do
not load this file into a DAT by hand: WebGuiServerExt generates one CHOP
Execute DAT per CHOP the READOUTS map references, resolved inside the
component's Td Core Dir par so editing this file hot-reloads all of them.

**This callback marks; it does not send.** A CHOP Execute DAT can fire several
times per frame per channel on a time-sliced CHOP, so broadcasting from here
would flood the socket — instead this only flags the name, and one coalesced
`update` goes out at end of frame (see webserver-callbacks.flush_readouts).

Only onValueChange is implemented. The threshold callbacks (Off to On, While
On, ...) ask a different question than "what does this channel read now".
"""


def _webgui():
    """The WebGuiServer component, via its parent shortcut."""
    comp = getattr(parent, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "chop-execute: no parent OP shortcut 'WebGuiServer' found above this DAT - "
            "set Parent Shortcut on the WebGuiServer component"
        )
    return comp


def _config():
    dat = _webgui().op("config")
    if dat is None:
        raise RuntimeError(
            "chop-execute: WebGuiServer has no 'config' DAT - check its Config File parameter"
        )
    return dat.module


def _callbacks():
    name = _config().CALLBACKS
    dat = _webgui().op(name)
    if dat is None:
        raise RuntimeError(
            "chop-execute: WebGuiServer has no DAT '%s' - check CALLBACKS in the config DAT" % name
        )
    return dat.module


def onValueChange(channel, sampleIndex, val, prev):
    # `val` is not forwarded: the flush re-reads the channel at end of frame, so
    # what reaches the browser is the value that survived the frame.
    _callbacks().broadcast_channel_change(channel)
    return


def onOffToOn(channel, sampleIndex, val, prev):
    return


def whileOn(channel, sampleIndex, val, prev):
    return


def onOnToOff(channel, sampleIndex, val, prev):
    return


def whileOff(channel, sampleIndex, val, prev):
    return
