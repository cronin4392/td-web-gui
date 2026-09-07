"""
DAT Execute DAT — carries edits to config.py into the running network.

The config DAT loads config.py with Sync to File on, so editing the file on disk
updates the DAT's text immediately — but nothing downstream notices on its own,
since the generated watchers and stream chains are only built by
WebGuiServerExt.Rebuild(). This DAT closes that gap by calling Rebuild() on
every change.

Table Change, not a text-change callback: the DAT Execute DAT has none. A Text
DAT is a 1x1 table, so any edit to config.py is a cell change and
onTableChange is the hook that sees it (as of 2025.30000 it "does everything
now" and the other four are deprecated). Execute = End of Frame coalesces a
multi-part rewrite into one rebuild.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates the single
DAT Execute DAT that loads it, points it at the component's own config DAT,
and syncs its text from here.
"""


def _webgui():
    """The WebGuiServer component, via its parent shortcut."""
    comp = getattr(parent, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "config-execute: no parent OP shortcut 'WebGuiServer' found above this DAT - "
            "set Parent Shortcut on the WebGuiServer component"
        )
    return comp


def onTableChange(dat, prevDAT, info):
    # `info` isn't consulted: Rebuild is diff-based against the live network, so
    # "the config changed somehow" is the whole question this has to answer.
    _webgui().Rebuild()
    return


# Deprecated as of 2025.30000 — onTableChange covers all four. Left as no-ops so
# enabling one by hand on the generated DAT does nothing rather than raising.


def onRowChange(dat, rows):
    return


def onColChange(dat, cols):
    return


def onCellChange(dat, cells, prev):
    return


def onSizeChange(dat):
    return
