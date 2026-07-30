"""
pre_release hook — strips the generated watchers and stream chains out of the
.tox before it ships.

Embody's portable TOX export runs this on a STAGED COPY of the component, then
deletes both hook DATs from that copy before saving, so the exported .tox
carries neither the build product nor this file. The live component is
untouched — its watchers and streams keep running through the export.

Same argument as exit-execute.py's onExit, at the other artifact boundary: the
generated operators are wholly derived from REGISTRY/READOUTS/STREAMS, and a
.tox is meant to be dropped into a project whose config is nothing like this
one — shipping this project's watchers would land that project with DATs and
TOPs pointed at operators it doesn't have.

Kept, deliberately: the config and exit watchers, excluded by tag inside
DestroyGenerated. exit_watch is what makes a dropped-in .tox start itself — its
onCreate fires when the component lands in the receiving project and calls
Rebuild there.

BOTH references below are load-bearing, and point at different components.
`parent()` is the staged copy — the only thing this hook may CHANGE.
`_source()` finds the live original, borrowed for its extension.

The borrow isn't a shortcut around `parent().DestroyGenerated()` — that call
cannot work. Embody stages the copy under /sys/quiet, a branch with cooking
DISABLED, and TD will not compile an extension inside one ("Module compilation
error ... Parent component is cooking disabled"). So the staged copy has no
extension at all; the live component's extension is compiled and working, and
reading tags and destroying operators needs no cooking, so it does the work on
the copy's behalf instead of restating "what counts as generated" a second time.

`_source()` finding the LIVE component during a release is a guarantee, not
luck — WebGuiServerExt stamps the live component's own path onto this DAT's
storage on every Rebuild (see _SOURCE_PATH_KEY in webgui-server-ext.py), and
storage rides along when Embody copies the DAT into the staged tree. Neither a
relative path nor a parent shortcut could do this instead: the staged copy
under /sys/quiet isn't a descendant of the live component, so nothing about
its position in the tree points back to where it came from. This also means no
global OP shortcut is needed at all, so several WebGuiServer instances can
live in one project without one stealing another's shortcut. Even if the
stored path were somehow stale, this would not silently strip the running
session: the target is the explicitly passed `parent()`.

`args[0]` (the resolved save path) is unused — what gets removed doesn't
depend on where the .tox lands.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates the
`pre_release` Text DAT that loads it. The name is fixed by Embody: the hook
must be a Text DAT named exactly `pre_release`, a direct child of the exported
COMP.
"""

_SOURCE_PATH_KEY = "WebGuiServerSourcePath"


def _source():
    path = me.fetch(_SOURCE_PATH_KEY, None, search=False)
    if not path:
        raise RuntimeError(
            "pre-release: no '%s' in storage on this DAT - "
            "WebGuiServerExt.Rebuild() must run at least once on the live "
            "component before export" % _SOURCE_PATH_KEY
        )
    comp = op(path)
    if comp is None:
        raise RuntimeError("pre-release: stored source path '%s' does not resolve" % path)
    return comp


# Module level, not a callback: a hook DAT runs as a script rather than being
# imported for its functions.
#
# Left to raise on failure — Embody aborts the export and keeps the staged
# copy for inspection, which is the right outcome for a release that would
# otherwise ship this project's watchers.
_source().DestroyGenerated(parent())
