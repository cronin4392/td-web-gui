"""
Execute DAT — bookends the generated watchers' and stream chains' lifecycle:
Create rebuilds them, Exit drops them. Both families are wholly derived from
the config, so WebGuiServerExt.Rebuild() can reproduce every one of them at
any moment.

ON CREATE — covers the gap onInitTD's deferred Rebuild does not. Reloading
this component from an External .tox while it's already live (Component
Editor's Reinit Network, or enableexternaltoxpulse) recreates every child node
fresh, so Create fires again — but it does NOT recompile the extension object,
so onInitTD does not fire and nothing reruns Rebuild(). (Verified empirically
against 2025.33070.) Extensions are also lazily instantiated, a second,
independent reason the same reload can leave Rebuild() never having run.
Routing through this DAT's onCreate sidesteps both — it needs no extension
access, only a node existing.

ON EXIT — a build product has no business being saved into the project: it
would ship a stale snapshot that has to be reconciled away on the next open.
Deleting it on the way out means the saved network holds only the hand-built
parts.

Exit, not the extension's own onDestroyTD: onDestroyTD runs on every reinit,
including the one that fires every time webgui-server-ext.py is saved, and
tearing everything down there would delete the bridge on every edit. onExit is
the only hook that means "the application is going away" rather than "this
component is being rebuilt" — see WebGuiServerExt.onDestroyTD.

ORDERING CAVEAT — read before relying on the Exit half. TD does not save on
exit by itself. With "Prompt to Save on Exit" enabled, Save & Quit's save
resolves BEFORE the quit proceeds, so that save still captures everything and
onExit runs after it — meaning this callback reliably cleans the project for
every save FROM that point on, not retroactively for the Save & Quit itself.
An Execute DAT also exposes onProjectPreSave, untested here — a stronger fix
may exist.

Everything generated goes except the config and exit watchers themselves —
those two make the next open able to rebuild everything else, so they survive
by tag (CONFIG_TAG / EXIT_TAG in webgui-server-ext.py), the exit watcher most
pointedly since this callback runs from inside its own DAT.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates the single
Execute DAT that loads it and syncs its text from here.
"""


def _webgui():
    """The WebGuiServer component, via its global OP shortcut."""
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
# Create and Exit only, so none of these fires unless someone toggles one on by
# hand.


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
