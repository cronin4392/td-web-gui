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
`op.WebGuiServer` is the live original, borrowed for its extension.

The borrow isn't a shortcut around `parent().DestroyGenerated()` — that call
cannot work. Embody stages the copy under /sys/quiet, a branch with cooking
DISABLED, and TD will not compile an extension inside one ("Module compilation
error ... Parent component is cooking disabled"). So the staged copy has no
extension at all; the live component's extension is compiled and working, and
reading tags and destroying operators needs no cooking, so it does the work on
the copy's behalf instead of restating "what counts as generated" a second time.

`op.WebGuiServer` resolving to the LIVE component during a release is a
guarantee, not luck — a global OP shortcut is unique, and Embody clears
`opshortcut` on the staged copy. Even if that changed, this would not silently
strip the running session: the target is the explicitly passed `parent()`.

`args[0]` (the resolved save path) is unused — what gets removed doesn't
depend on where the .tox lands.

Nothing here is project specific — drop this into any project unchanged. You
do not load this file into a DAT by hand: WebGuiServerExt generates the
`pre_release` Text DAT that loads it. The name is fixed by Embody: the hook
must be a Text DAT named exactly `pre_release`, a direct child of the exported
COMP.
"""

# Module level, not a callback: a hook DAT runs as a script rather than being
# imported for its functions.
#
# Left to raise on failure — Embody aborts the export and keeps the staged
# copy for inspection, which is the right outcome for a release that would
# otherwise ship this project's watchers.
op.WebGuiServer.DestroyGenerated(parent())
