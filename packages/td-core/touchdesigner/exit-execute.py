"""
Execute DAT — bookends the generated watchers' and stream chains' lifecycle:
Create rebuilds them, Exit drops them.

Both families are wholly derived from the config: WebGuiServerExt.Rebuild() can
reproduce every one of them from REGISTRY, READOUTS, and STREAMS at any moment.

ON CREATE — covers the gap onInitTD's deferred Rebuild does not. Reloading this
component from an External .tox while it's already live (Component Editor's
Reinit Network, or pulsing enableexternaltoxpulse) recreates every child node
fresh, so Create fires again on this DAT same as it would on a first load — but
it does NOT recompile the extension object, so onInitTD does NOT fire, and
nothing reruns Rebuild(). (Verified empirically against 2025.33070: a counter
living outside the reloaded subtree climbed on every reinit through Create, and
stayed flat through onInitTD unless Reinit Extensions was pulsed separately.)
Extensions are also lazily instantiated — only on first access or when the
component cooks — which is a second, independent reason the same reload can
leave Rebuild() never having run. Routing through this DAT's onCreate sidesteps
both, since it needs no extension access at all, only a node existing.

ON EXIT — a build product has no business being saved into the project: a
.toe/.tdn carrying watchers and stream chains ships a snapshot of whatever the
config said the last time someone saved, which then has to be reconciled away on
the next open. Deleting them on the way out means the saved network holds only
the hand-built parts, and the generated parts are rebuilt from the live config
every time the project opens.

Exit, not the extension's own onDestroyTD: onDestroyTD runs on every extension
reinit — including the one that fires each time webgui-server-ext.py is saved —
and tearing everything down there would delete the bridge mid-session, every
edit. onExit is the only hook that means "the application is going away" rather
than "this component is being rebuilt". See WebGuiServerExt.onDestroyTD, which
stays a no-op for exactly that reason.

ORDERING CAVEAT — read before relying on the Exit half. TouchDesigner does not
save on exit by itself. With "Prompt to Save on Exit" enabled (Preferences →
General) a modal offers Save & Quit / Discard & Quit / Cancel, and the save that
Save & Quit performs resolves the prompt BEFORE the quit it gates proceeds — so
that save still captures everything, and onExit runs after it. What this
callback reliably does is leave the running project clean at shutdown, so any
save taken from that point on, and every subsequent session, writes a
watcher-and-stream-free network. It is not a retroactive fix for a Save & Quit.
An Execute DAT also exposes onProjectPreSave — untested here, and not relied on
by this file — so a stronger fix may exist; do not assume it does not without
checking.

Everything generated goes except the config and exit watchers themselves: those
two are what make the next open able to rebuild everything else, so they survive
by tag (see CONFIG_TAG / EXIT_TAG in webgui-server-ext.py) — the exit watcher
most pointedly, since this callback runs from inside its own DAT.

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


def onCreate():
    _webgui().Rebuild()
    return


def onExit():
    _webgui().DestroyGenerated()
    return


# The remaining Execute DAT hooks are left as no-ops. The generated DAT enables
# Create and Exit only, so none of these is reached unless someone turns a
# toggle on by hand — in which case doing nothing is better than raising during
# startup or once per frame.


def onStart():
    return


def onFrameStart(frame):
    return


def onFrameEnd(frame):
    return


def onPlayStateChange(state):
    return


def onDeviceChange():
    return
