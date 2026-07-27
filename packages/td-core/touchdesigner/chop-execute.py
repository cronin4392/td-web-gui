"""
CHOP Execute DAT — TD -> web bridge for CHOP-backed readouts.

Watches the CHOPs named by the config's READOUTS and tells the Web Server DAT's
callbacks module which channel moved. Readouts are one-way: nothing here ever
writes to a CHOP, and a web `update` aimed at a readout name is refused by
webserver-callbacks with `param_not_writable`.

Nothing here is project specific — drop this into any project unchanged. The
name of the callbacks DAT comes from CALLBACKS in the config DAT, which the
WebGuiServer component loads from its Config File par; see config-template.py.

You do not load this file into a DAT by hand, and you do not configure one.
WebGuiServerExt generates one CHOP Execute DAT per CHOP the READOUTS map
references and sets each one's CHOP, Channel, and Value Change from it. It is
resolved inside the component's Td Core Dir par, and the generated DATs sync
their text from it — so editing this file hot-reloads all of them at once.

**This callback marks; it does not send.** A CHOP Execute DAT runs its script
"for every sample that changes, so when rendering one frame, it may get called 2
or more times per channel" on a time-sliced CHOP. Broadcasting from here would
therefore put several messages per frame on the socket for a single channel, and
N times that for N readouts. Instead broadcast_channel_change() only flags the
name, and one coalesced `update` goes out at end of frame — see
webserver-callbacks.flush_readouts.

Deliberately implemented here: only onValueChange. The threshold callbacks
(Off to On, While On, ...) describe a channel crossing zero, which is a
different question from "what does this channel read now" — the only one a
readout asks. The generated DATs leave those toggles off.
"""


def _webgui():
    """The WebGuiServer component, via its global OP shortcut.

    A shortcut rather than a path, so this file resolves it wherever it's dropped.
    """
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "chop-execute: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
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
    # Resolved from inside WebGuiServer, not from beside this DAT: the callbacks
    # DAT lives in the component, while this DAT lives wherever the CHOPs it
    # watches are. webserver-callbacks.py resolves CALLBACKS the same way, so a
    # bare name means the same thing in both scripts.
    name = _config().CALLBACKS
    dat = _webgui().op(name)
    if dat is None:
        # Raise rather than return None. A missing callbacks DAT means every
        # readout change is dropped on the floor, which would otherwise be
        # indistinguishable from a CHOP that simply never moves.
        raise RuntimeError(
            "chop-execute: WebGuiServer has no DAT '%s' - check CALLBACKS in the config DAT" % name
        )
    return dat.module


def onValueChange(channel, sampleIndex, val, prev):
    # `val` is deliberately not forwarded: the flush re-reads the channel at end
    # of frame, so what reaches the browser is the value that survived the frame
    # rather than whichever sample happened to fire last.
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
