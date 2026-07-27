"""
DAT Execute DAT — carries edits to config.py into the running network.

The config DAT loads config.py with Sync to File on, so editing the file on disk
updates the DAT's text immediately. Nothing downstream noticed: the generated
watcher DATs and stream chains are built by WebGuiServerExt.Rebuild(), which ran
once at extension init, so a registry entry added at 3am reached the web only
after a manual Rebuild() or a restart. This closes that gap — the file is the
source of truth, and saving it is the whole of the work.

Table Change, not a text-change callback: the DAT Execute DAT has none. A Text
DAT is a 1x1 table whose single cell holds the entire text, so any edit to
config.py is a cell change and onTableChange is the hook that sees it. (As of
2025.30000 onTableChange "does everything now" and the other four are
deprecated.) The generated DAT also sets Execute = End of Frame, so a rewrite
that lands in several pieces rebuilds once rather than once per piece.

Nothing here is project specific — drop this into any project unchanged.

You do not load this file into a DAT by hand, and you do not configure one.
WebGuiServerExt generates the single DAT Execute DAT that loads it, points it at
the component's own config DAT, and syncs its text from here.
"""


def _webgui():
    """The WebGuiServer component, via its global OP shortcut.

    A shortcut rather than a path, so this file resolves it wherever it's dropped.
    """
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "config-execute: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
        )
    return comp


def onTableChange(dat, prevDAT, info):
    # `info` is deliberately not consulted, and neither is the new text. Rebuild
    # is diff-based against the live network, so "the config changed somehow" is
    # the entire question this callback has to answer — working out WHICH entry
    # changed here would be a second, weaker copy of the reconciliation it
    # already does.
    _webgui().Rebuild()
    return


# Deprecated as of 2025.30000 — onTableChange covers all four. Left as no-ops so
# that enabling one by hand on the generated DAT does nothing rather than raising.


def onRowChange(dat, rows):
    return


def onColChange(dat, cols):
    return


def onCellChange(dat, cells, prev):
    return


def onSizeChange(dat):
    return
