"""
pre_release hook — strips the generated watchers and stream chains out of the
.tox before it ships.

Embody's portable TOX export runs this on a STAGED COPY of the component, then
deletes both hook DATs from that copy before saving, so the exported .tox carries
neither the build product nor this file. The live component is untouched: its
watchers and streams keep running through the export.

Same argument as exit-execute.py's onExit, applied to the other artifact
boundary. The generated operators are wholly derived from REGISTRY, READOUTS, and
STREAMS, so Rebuild() reproduces them anywhere — and a .tox is meant to be
dropped into a project whose config is nothing like this one. Shipping this
project's watchers would land that project with Parameter Execute DATs pointed at
operator paths it doesn't have (errors on the DATs the moment it opens) and
Select TOPs fetching TOPs that aren't there, all of it swept away by the first
Rebuild — churn on open, in exchange for nothing.

Kept, deliberately: the config and exit watchers, excluded by tag inside
DestroyGenerated. exit_watch is what makes a dropped-in .tox start itself — its
onCreate fires when the component lands in the receiving project and calls
Rebuild there, without depending on the extension having been instantiated first.
Stripping it would trade a clean artifact for a component that sometimes needs a
manual Rebuild after a drop-in.

BOTH references below are load-bearing, and they point at different components.
`parent()` is the staged copy — the only thing this hook has any business
CHANGING. `op.WebGuiServer` is the live original, borrowed for its extension.

The borrow is not a shortcut around calling `parent().DestroyGenerated()`; that
call cannot work. Embody stages the copy under /sys/quiet, a branch with cooking
DISABLED, and TouchDesigner will not compile an extension inside one:

    Module compilation error for /sys/quiet/WebGuiServer/WebGuiServerExt.
    Parent component is cooking disabled.

So the staged copy has no extension at all — `parent().DestroyGenerated()` raises
AttributeError and aborts the export, which is exactly how this was found. The
live component's extension is compiled and working, and reading tags and
destroying operators needs no cooking, so it can do the work on the copy's
behalf. The alternative — restating "what counts as generated" here — is a second
copy of a rule that already exists once, and the one guaranteed way for the hook
and the reconciliation it mirrors to drift apart.

`op.WebGuiServer` resolving to the LIVE component during a release is a
guarantee, not luck: a global OP shortcut is unique, and Embody clears
`opshortcut` on the staged copy. If that ever changed, this would still not
silently strip the running session — the target is the explicitly passed
`parent()`, not whatever the shortcut resolved to.

`args[0]` (the resolved save path) is unused: what gets removed doesn't depend on
where the .tox lands.

Nothing here is project specific — drop this into any project unchanged.

You do not load this file into a DAT by hand, and you do not configure one.
WebGuiServerExt generates the `pre_release` Text DAT that loads it and syncs its
text from here. The name is fixed by Embody: the hook must be a Text DAT named
exactly `pre_release`, a direct child of the exported COMP.
"""

# Module level, not a callback: a hook DAT is run as a script rather than
# imported for its functions, so this is the whole of it.
#
# Left to raise on failure. Embody aborts the export and keeps the staged copy
# for inspection when a hook errors, which is the right outcome — a release that
# would have shipped this project's watchers is worse than one that didn't
# happen, and the kept copy is what makes the reason inspectable.
op.WebGuiServer.DestroyGenerated(parent())
