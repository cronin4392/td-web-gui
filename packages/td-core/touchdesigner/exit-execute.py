"""
Execute DAT — bookends the generated watchers' and stream chains' lifecycle:
Create rebuilds them, each save drops and restores them, Exit drops them. Both
families are wholly derived from the config, so WebGuiServerExt.Rebuild() can
reproduce every one of them at any moment — which is what makes it safe to
delete them whenever having them around would be wrong.

ON CREATE — covers the gap onInitTD's deferred Rebuild does not. Reloading
this component from an External .tox while it's already live (Component
Editor's Reinit Network, or enableexternaltoxpulse) recreates every child node
fresh, so Create fires again — but it does NOT recompile the extension object,
so onInitTD does not fire and nothing reruns Rebuild(). (Verified empirically
against 2025.33070.) Extensions are also lazily instantiated, a second,
independent reason the same reload can leave Rebuild() never having run.
Routing through this DAT's onCreate sidesteps both — it needs no extension
access, only a node existing.

ON PROJECT PRE/POST SAVE — the pair that keeps the build product out of the
.toe, and the only one that catches EVERY save rather than just the last one.
A build product has no business being saved into the project: it would ship a
stale snapshot that has to be reconciled away on the next open, and it carries
dead runtime state with it (an encoder's WebRTC Connection is a peer id that
stopped existing the moment the session did). Pre-save deletes it, the file is
written without it, post-save puts it straight back.

Measured on 2025.33070, saving with 26 generated ops live: 666,332 bytes with
this off, 659,868 with it on.

Post-save must also RE-ATTACH the streams. The rebuild hands every stream a
brand-new Video Stream Out TOP, and a new one has no WebRTC parameters set —
the peer and its tracks survive (they belong to the WebRTC DAT, which was never
touched), so without the re-attach a save leaves a connected browser showing
black tiles with no error anywhere.

ON EXIT — kept as a backstop, not the primary mechanism. TD does not save on
exit by itself, and with "Prompt to Save on Exit" the Save & Quit save now goes
through onProjectPreSave like any other. What onExit still covers is a session
that ends without a save reaching pre-save at all.

Exit, not the extension's own onDestroyTD: onDestroyTD runs on every reinit,
including the one that fires every time webgui-server-ext.py is saved, and
tearing everything down there would delete the bridge on every edit. onExit is
the only hook that means "the application is going away" rather than "this
component is being rebuilt" — see WebGuiServerExt.onDestroyTD.

Neither hook is a guarantee: a crash writes CrashAutoSave.<project>.toe with no
callback firing at all, and a .toe saved before this file grew these callbacks
still holds a build product. That residue is why onCreate passes reset_enabled
— an encoder that DOES arrive already existing must still start the session in
its configured state rather than in whatever it was left in.

Everything generated goes except the config and exit watchers themselves —
those two make the next open able to rebuild everything else, so they survive
by tag (CONFIG_TAG / EXIT_TAG in webgui-server-ext.py), the exit watcher most
pointedly since this callback runs from inside its own DAT.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates the single
Execute DAT that loads it and syncs its text from here.
"""


def _webgui():
    """The WebGuiServer component, via its parent shortcut."""
    comp = getattr(parent, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "exit-execute: no parent OP shortcut 'WebGuiServer' found above this DAT - "
            "set Parent Shortcut on the WebGuiServer component"
        )
    return comp


def onCreate():
    # reset_enabled: the component has just come into being, so each stream
    # starts in the state its STREAMS entry asks for, even if an encoder
    # survived into the saved project carrying a toggle from last session.
    _webgui().Rebuild(reset_enabled=True)
    return


def onExit():
    _webgui().DestroyGenerated()
    return


def onProjectPreSave():
    _webgui().SuspendGenerated()
    return


def onProjectPostSave():
    _webgui().RestoreGenerated()
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
