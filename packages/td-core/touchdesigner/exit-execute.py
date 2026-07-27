"""
Execute DAT — drops the generated watcher DATs when TouchDesigner closes.

The watcher DATs are wholly derived from the config: WebGuiServerExt.Rebuild()
can reproduce every one of them from REGISTRY and READOUTS at any moment. That
makes them a build product, and a build product has no business being saved into
the project — a .toe/.tdn carrying watchers ships a snapshot of whatever the
config said the last time someone saved, which then has to be reconciled away on
the next open. Deleting them on the way out means the saved network holds only
the hand-built half, and the generated half is rebuilt from the live config every
time the project opens.

Exit, not the extension's own onDestroyTD: onDestroyTD runs on every extension
reinit — including the one that fires each time webgui-server-ext.py is saved —
and tearing the watchers down there would delete the bridge mid-session, every
edit. onExit is the only hook that means "the application is going away" rather
than "this component is being rebuilt". See WebGuiServerExt.onDestroyTD, which
stays a no-op for exactly that reason.

ORDERING CAVEAT — read before relying on this. TouchDesigner does not save on
exit by itself. With "Prompt to Save on Exit" enabled (Preferences → General) a
modal offers Save & Quit / Discard & Quit / Cancel, and the save that Save & Quit
performs resolves the prompt BEFORE the quit it gates proceeds — so that save
still captures the watchers, and onExit runs after it. What this callback
reliably does is leave the running project clean at shutdown, so any save taken
from that point on, and every subsequent session, writes a watcher-free network.
It is not a retroactive fix for a Save & Quit. TouchDesigner exposes no pre-save
callback, so there is no hook that could make it one.

Only the watchers go. The STREAMS chains are left alone: a Video Stream Out TOP
is a real part of the rendered network rather than a callback bridge, and the
config watcher and this DAT are the two things that have to survive in order to
rebuild anything at all.

Nothing here is project specific — drop this into any project unchanged.

You do not load this file into a DAT by hand, and you do not configure one.
WebGuiServerExt generates the single Execute DAT that loads it and syncs its text
from here.
"""


def _webgui():
    """The WebGuiServer component, via its global OP shortcut.

    A shortcut rather than a path, so this file resolves it wherever it's dropped.
    """
    comp = getattr(op, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "exit-execute: no global OP shortcut 'WebGuiServer' - "
            "set one on the component holding the config DAT"
        )
    return comp


def onExit():
    _webgui().DestroyWatchers()
    return


# The remaining Execute DAT hooks are left as no-ops. The generated DAT enables
# Exit alone, so none of these is reached unless someone turns a toggle on by
# hand — in which case doing nothing is better than raising during startup or
# once per frame.


def onStart():
    return


def onCreate():
    return


def onFrameStart(frame):
    return


def onFrameEnd(frame):
    return


def onPlayStateChange(state):
    return


def onDeviceChange():
    return
