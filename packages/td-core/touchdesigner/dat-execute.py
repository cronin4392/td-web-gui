"""
DAT Execute DAT — TD -> web bridge for DAT-backed readouts.

Watches the DATs named by the config's READOUTS and tells the Web Server DAT's
callbacks module that one changed. Covers both readout shapes a DAT can back: a
single cell (`row`/`col`) and a whole table (`type: 'string[][]'`). Readouts
are one-way; a web `update` aimed at one is refused by webserver-callbacks with
`param_not_writable`.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates one DAT
Execute DAT per DAT the READOUTS map references, resolved inside the
component's Td Core Dir par so editing this file hot-reloads all of them.

Only onTableChange is implemented — as of 2025.30000 it "does everything now"
and the other four are deprecated; they're kept below as no-ops so toggling
one on by hand doesn't raise.

The generated DATs also set Execute = End of Frame, the DAT Execute DAT's own
coalescer. CHOP-backed readouts have no equivalent, which is why that side
coalesces in webserver-callbacks.flush_readouts instead — this file marks
rather than sends, so both paths share one end-of-frame `update`.
"""


def _webgui():
    """The WebGuiServer component, via its parent shortcut."""
    comp = getattr(parent, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "dat-execute: no parent OP shortcut 'WebGuiServer' found above this DAT - "
            "set Parent Shortcut on the WebGuiServer component"
        )
    return comp


def _config():
    dat = _webgui().op("config")
    if dat is None:
        raise RuntimeError(
            "dat-execute: WebGuiServer has no 'config' DAT - check its Config File parameter"
        )
    return dat.module


def _callbacks():
    name = _config().CALLBACKS
    dat = _webgui().op(name)
    if dat is None:
        raise RuntimeError(
            "dat-execute: WebGuiServer has no DAT '%s' - check CALLBACKS in the config DAT" % name
        )
    return dat.module


def onTableChange(dat, prevDAT, info):
    # `info` isn't consulted: the flush re-reads whatever this DAT backs, so
    # narrowing to the changed cells would just be a second copy of the shape
    # rules webserver-callbacks already owns.
    _callbacks().broadcast_table_change(dat)
    return


# Deprecated as of 2025.30000 — onTableChange covers all four. Left as no-ops so
# enabling one by hand on a generated DAT does nothing rather than raising.


def onRowChange(dat, rows):
    return


def onColChange(dat, cols):
    return


def onCellChange(dat, cells, prev):
    return


def onSizeChange(dat):
    return
