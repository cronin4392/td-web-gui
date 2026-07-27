"""
WebGuiServer extension — generates the watcher DATs that carry TD -> web changes.

Three kinds, all derived from the config, so adding an entry to either map is
the whole of the work — no DAT to create, no `OPs` string to keep in sync:

        REGISTRY  -> one Parameter Execute DAT per operator, watching exactly that
                     operator's registered parameters      (parameter-execute.py)
        READOUTS  -> one CHOP Execute DAT per CHOP, watching exactly the channels
                     those readouts read                   (chop-execute.py)
                  -> one DAT Execute DAT per DAT           (dat-execute.py)

Nothing here is project specific — drop this into any project unchanged, like
the other scripts. It reads the same config the callbacks read, through the same
`op.WebGuiServer` global shortcut.

Set on the WebGuiServer component:
        Tdcoredir     Folder par pointing at this directory. The three callback
                      scripts above are resolved inside it, and every generated DAT
                      syncs its text from there — so a hot-reload of one of those
                      files reaches all of its DATs at once. The same par already
                      locates the hand-placed callbacks scripts.

Why one DAT per operator rather than one watching everything: a Parameter
Execute DAT's `OPs` and `Parameters` fields are a cross product, so a single DAT
covering N operators watches every registered parameter NAME on every one of
them. Custom names rarely collide across operators, but built-in ones (`file`,
`index`, `device`) collide constantly, and the `Built-In` toggle is per-DAT.
Splitting per operator makes each watch an exact set of (operator, parameters)
pairs and scopes `Built-In` to the operators that actually need it. A CHOP
Execute DAT's `CHOP`/`Channel` fields are a cross product in the same way, and
channel names (`tx`, `level`, `chan1`) collide across CHOPs far more readily
than parameter names do.

        Correctness does not depend on any of that — the broadcast functions in
        webserver-callbacks.py re-check the owning operator and the parameter or
        channel name against the config before sending, so an over-broad watch was
        only ever wasted work. This is about cost, and about the watch being legible.
"""

import math

# The File expression each generated DAT gets, by kind, matching how the
# hand-placed callbacks DATs resolve their own sources. Resolved inside the
# component's Tdcoredir rather than configured separately: the component already
# knows where the td-core scripts live, and a second par holding a path into the
# same folder is one more thing to get out of step.
#
# Expressions rather than baked absolute paths, so repointing Tdcoredir — on
# another machine, or a moved checkout — moves every generated DAT at once
# instead of waiting for the next Rebuild to notice.
_TDCOREDIR = "op.WebGuiServer.par.Tdcoredir.eval() + '/%s'"

# The three watcher kinds. Each names its target operator through a DIFFERENT
# parameter, which is also how _kindOf recognises an existing DAT — read off the
# operator itself rather than remembered in a tag that could go stale.
_PAREXEC = "par"
_CHOPEXEC = "chop"
_DATEXEC = "dat"

_WATCH = {
    _PAREXEC: {
        "optype": parameterexecuteDAT,
        "prefix": "parexec_",
        "target": "op",  # the "OPs" par
        "file": _TDCOREDIR % "parameter-execute.py",
    },
    _CHOPEXEC: {
        "optype": chopexecuteDAT,
        "prefix": "chopexec_",
        "target": "chop",
        "file": _TDCOREDIR % "chop-execute.py",
    },
    _DATEXEC: {
        "optype": datexecuteDAT,
        "prefix": "datexec_",
        "target": "dat",
        "file": _TDCOREDIR % "dat-execute.py",
    },
}

# Marks a DAT as created and owned by this extension. Reconciliation only ever
# deletes operators carrying this tag — a generated component that deletes by
# name pattern alone eventually eats something a human made.
GENERATED_TAG = "webgui-generated"

# Shown on each generated DAT, since the thing a reader most needs to know about
# an operator they didn't create is that editing it is pointless.
GENERATED_COMMENT = (
    "Generated from the config REGISTRY / READOUTS by "
    "WebGuiServerExt. Edits are overwritten on the next Rebuild."
)

# Layout: generated DATs stack in a column to the right of the component's
# hand-built operators. Vertical step is computed from the tallest actual tile
# rather than assumed, then snapped up to the 200 grid.
_GRID = 200
_GAP = 60


class WebGuiServerExt:
    """Keeps the generated Parameter Execute DATs in step with the config."""

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def onInitTD(self):
        """Rebuild once the network around us has settled.

        Deferred rather than immediate because this component may be a
        TDN-strategy COMP, and TDN reconstruction calls ImportNetwork with
        clear_first=True — it deletes every child and recreates them from the
        .tdn. Work done during init would be thrown away by that import.

        The delay handles the save strip/restore cycle, where the import
        completes within a few frames. It deliberately does NOT try to outwait
        project open, where ReconstructTDNComps runs at frame 60: no fixed delay
        is honest there. Instead the extension reinitializes after the import
        (TD re-inits extensions inside a TDN COMP on open, after every save, and
        on manual reimport), and because Rebuild reconciles against whatever is
        live at the moment it runs, that later init converges. Correctness comes
        from Rebuild being idempotent, not from guessing the right delay.
        """
        run("args[0].Rebuild()", self, delayFrames=5)

    def onDestroyTD(self):
        """Nothing to tear down.

        The extension holds no timers, threads, or callback registrations, and
        the generated DATs are meant to outlive a reinit — tearing them down here
        would delete the bridge every time this file is edited.
        """
        pass

    # ── public ────────────────────────────────────────────────────────────────

    def Rebuild(self):
        """Make the generated watcher DATs match the config's REGISTRY + READOUTS.

        Idempotent and diff-based: it compares what the config asks for against
        the DATs that are live *right now*, and applies only the difference. It
        caches nothing between runs, which is what makes it safe under TDN —
        storage survives an import that deletes children, so a remembered "already
        built" flag would outlive the DATs it described and leave the bridge
        silently dead. Reading the live network cannot go stale that way.

        Safe to call at any time, from any trigger, as often as you like. When
        nothing has changed it writes nothing.
        """
        desired = self._desiredWatches()
        if desired is None:
            return  # config unreadable; _config() already explained why

        self._warnIfNoCoreDir()
        keep, orphans = self._matchExisting(desired)

        for dat in orphans:
            dat.destroy()

        # Keyed on (kind, op path), so one operator can legitimately carry two
        # watchers of different kinds and a CHOP path can never be mistaken for
        # the parameter watcher of an operator with the same path.
        for key in sorted(desired):
            dat = keep.get(key)
            if dat is None:
                dat = self._createWatcher(key)
            self._applyWatch(dat, key, desired[key])

        self._layout()

    # ── config ────────────────────────────────────────────────────────────────

    def _config(self):
        dat = self.ownerComp.op("config")
        if dat is None:
            debug("WebGuiServerExt: no 'config' DAT - check the Config File par")
            return None
        return dat.module

    def _callbacks(self):
        """The Web Server DAT's callbacks module.

        Reached for its par_names() and readout_watches(), so that "what backs
        this config entry" has exactly one implementation. A `number[]` entry
        names a ParGroup rather than a parameter, and a readout's source is
        inferred from its entry's shape — a second copy of either rule here is
        precisely how the watchers and the broadcast path would drift apart.
        """
        config = self._config()
        if config is None:
            return None
        name = config.CALLBACKS
        dat = self.ownerComp.op(name)
        if dat is None:
            debug("WebGuiServerExt: no DAT '%s' - check CALLBACKS in the config" % name)
            return None
        return dat.module

    # ── inference ─────────────────────────────────────────────────────────────

    def _inferParKindFromCasing(self, par_name):
        """Infer whether a parameter name is custom, from its first letter.

        INFERENCE, not a lookup — deliberately so, because it has to work for
        operators that aren't in the project yet, where there is no parameter to
        interrogate. It is nonetheless exact rather than a guess: TouchDesigner
        *enforces* the distinction it reads. Custom parameter names must begin
        with an uppercase letter ("if the first letter of the custom parameter is
        not uppercase, the creation will fail and an error is returned") and
        built-in parameter names are fully lowercase.

        Returns True for custom, False for built-in. Drives the generated DAT's
        Custom / Built-In toggles.
        """
        return bool(par_name) and par_name[0].isupper()

    def _parNames(self, entry):
        """The parameter names a watcher must list for one registry entry.

        A 'number[]' entry names a ParGroup ('Color'), while the parameters that
        actually change are its components ('Colorr', 'Colorg', ...). Watching the
        group name would watch nothing at all, and tuple parameters would silently
        never broadcast — so the group is expanded through the callbacks module,
        which already owns that resolution for the broadcast path.
        """
        callbacks = self._callbacks()
        if callbacks is not None:
            names = callbacks.par_names(entry)
            if names:
                return names

        # The operator or parameter isn't resolvable right now — a not-yet-built
        # operator, or a typo the callbacks have already warned about. Fall back
        # to the registry's own spelling so the watch still works if the operator
        # appears later. A ParGroup falls back to a prefix glob, which over-matches
        # ('Colormode' alongside 'Colorr'); harmless, because broadcast_param_change
        # matches against the real ParGroup components before it broadcasts.
        if entry["type"] == "number[]":
            return [entry["par"] + "*"]
        return [entry["par"]]

    def _readoutWatches(self):
        """What READOUTS asks for: op path -> {'family', 'chans'}.

        Delegated to the callbacks module, which owns the entry-shape rules. The
        getattr guard is for a project whose callbacks DAT predates readouts:
        Rebuild() runs at init, so an AttributeError here would take the
        PARAMETER watchers down with it, and a params-only project should not
        break because one of the two files is stale.
        """
        callbacks = self._callbacks()
        watches = getattr(callbacks, "readout_watches", None) if callbacks else None
        return watches() if watches else {}

    def _desiredWatches(self):
        """What the config asks for: (kind, op path) -> watch spec.

        Returns None when the config can't be read, so the caller can leave the
        network alone rather than reconcile against an empty config and delete
        every watcher.
        """
        config = self._config()
        if config is None:
            return None

        watches = {}
        for entry in config.REGISTRY.values():
            # Pulse entries are skipped: pulses are fired with Par.pulse(), which
            # raises On Pulse rather than Value Change, and hold no state to
            # broadcast anyway. Watching them would only widen the trigger surface.
            if entry["type"] == "pulse":
                continue

            watch = watches.setdefault(
                (_PAREXEC, entry["op"]), {"pars": [], "custom": False, "builtin": False}
            )
            for name in self._parNames(entry):
                if name not in watch["pars"]:
                    watch["pars"].append(name)
                if self._inferParKindFromCasing(name):
                    watch["custom"] = True
                else:
                    watch["builtin"] = True

        for path, readout in self._readoutWatches().items():
            kind = _CHOPEXEC if readout["family"] == "CHOP" else _DATEXEC
            watch = watches.setdefault((kind, path), {"chans": []})
            # A DAT Execute DAT watches the whole table and ignores this list;
            # it is carried anyway so both readout kinds share one shape here.
            for chan in readout["chans"]:
                if chan not in watch["chans"]:
                    watch["chans"].append(chan)

        return watches

    # ── reconciliation ────────────────────────────────────────────────────────

    def _generatedDats(self):
        return [c for c in self.ownerComp.children if GENERATED_TAG in c.tags]

    def _watchedBy(self, dat):
        """The (kind, watched op path) an existing generated DAT stands for.

        Recognised by WHICH parameter names its target — each kind uses a
        different one (`op` / `chop` / `dat`) and none carries another's. Read off
        the operator itself rather than remembered in a tag, so it cannot go
        stale; and matched on the path rather than the DAT's name, because a DAT
        someone renamed is still doing its job and rebuilding it would be churn
        for nothing.

        Returns None for anything carrying our tag that is none of the three — a
        leftover from an earlier shape of this component, or something tagged by
        hand. The caller treats that as an orphan rather than raising.
        """
        for kind, spec in _WATCH.items():
            # .val, not .eval(): these are OP-style parameters, so eval() resolves
            # to a list of operators rather than returning the path that was
            # configured. We are matching on what the DAT is set to watch.
            par = getattr(dat.par, spec["target"], None)
            if par is not None:
                return kind, par.val.strip()
        return None

    def _matchExisting(self, desired):
        """Split the generated DATs into ones to keep and ones to destroy."""
        keep = {}
        orphans = []
        for dat in self._generatedDats():
            key = self._watchedBy(dat)
            if key is not None and key in desired and key not in keep:
                keep[key] = dat
            else:
                # Either the config no longer references this operator, or a
                # second DAT ended up watching one that's already covered.
                orphans.append(dat)
        return keep, orphans

    def _datName(self, kind, path):
        """A legal, collision-free DAT name derived from the watched op path.

        Deriving from the full path rather than the operator's own name means two
        operators called 'params' in different networks can't land on the same
        name. The per-kind prefix keeps a CHOP and a parameter watcher of
        same-named operators apart, so there is no collision case to resolve.
        """
        return tdu.validName(_WATCH[kind]["prefix"] + path.strip("/").replace("/", "_"))

    def _createWatcher(self, key):
        kind, path = key
        dat = self.ownerComp.create(_WATCH[kind]["optype"], self._datName(kind, path))
        dat.tags.add(GENERATED_TAG)
        dat.comment = GENERATED_COMMENT
        return dat

    def _setPar(self, par, value):
        """Write a parameter only when it would actually change.

        Skipping no-op writes is what keeps a Rebuild that changes nothing from
        dirtying every generated DAT. Assignment puts the parameter in constant
        mode, which is what these all want.
        """
        # Compared against .val, not .eval(). The OPs parameter is OP-style: its
        # eval() resolves the pattern to a list of operators, so comparing it to
        # the path string we mean to write is never equal and rewrites every
        # time. .val is the literal configured string, which is the thing being
        # reconciled — and it is only meaningful in constant mode, which the
        # mode check above has already established.
        if par.mode != ParMode.CONSTANT or par.val != value:
            par.val = value

    def _setExpr(self, par, expr):
        """Put a parameter in expression mode, only when it isn't already there.

        Separate from _setPar because assigning .val would silently drop the
        parameter back to constant mode — the expression is the point here.
        """
        if par.mode != ParMode.EXPRESSION or par.expr != expr:
            par.expr = expr

    def _applyWatch(self, dat, key, watch):
        kind, path = key
        spec = _WATCH[kind]
        self._setPar(getattr(dat.par, spec["target"]), path)

        if kind == _PAREXEC:
            self._setPar(dat.par.pars, " ".join(watch["pars"]))
            self._setPar(dat.par.custom, int(watch["custom"]))
            self._setPar(dat.par.builtin, int(watch["builtin"]))
            # Value Change is the only callback parameter-execute.py implements.
            self._setPar(dat.par.valuechange, 1)
        elif kind == _CHOPEXEC:
            self._setPar(dat.par.channel, " ".join(watch["chans"]))
            # Value Change is the only callback chop-execute.py implements. The
            # threshold callbacks (Off to On, While On, ...) describe a channel
            # crossing zero, which is a different question from "what does this
            # channel read now" — the only one a readout asks.
            self._setPar(dat.par.valuechange, 1)
        else:
            # Table Change alone: as of 2025.30000 it "does everything now" and
            # the other four (Row/Column/Cell/Size Change) are deprecated.
            self._setPar(dat.par.tablechange, 1)
            # End of Frame is the DAT Execute DAT's own coalescer — it calls the
            # hook "at most one time per frame ... even if it triggered several
            # times in one frame". Start of Frame would call it once per change,
            # which for a table rewritten cell by cell is a burst per frame.
            # CHOP Execute DATs have no equivalent parameter, which is why that
            # side coalesces in webserver-callbacks.flush_readouts instead.
            self._setPar(dat.par.execute, "end")

        self._setPar(dat.par.active, 1)

        self._setExpr(dat.par.file, spec["file"])
        # Sync to File rather than a one-shot load, so editing the callback script
        # hot-reloads every generated DAT the way it already does for the
        # hand-placed callbacks DATs.
        self._setPar(dat.par.syncfile, 1)

    def _warnIfNoCoreDir(self):
        """Warn once per rebuild when Tdcoredir can't supply a source path.

        The File expression is set either way — it is correct wiring regardless,
        and an unresolvable path surfaces as an error on the DAT itself. This
        only turns the two silent setup mistakes into an actionable message.
        getattr rather than direct access because a component set up before this
        extension existed has no Tdcoredir par at all.
        """
        par = getattr(self.ownerComp.par, "Tdcoredir", None)
        if par is None or not par.eval().strip():
            debug(
                "WebGuiServerExt: Tdcoredir is unset - generated DATs cannot "
                "resolve their callback scripts (parameter-execute.py, "
                "chop-execute.py, dat-execute.py), so TD -> web changes will "
                "not broadcast"
            )

    # ── layout ────────────────────────────────────────────────────────────────

    def _layout(self):
        """Stack the generated DATs in a column right of the hand-built operators.

        Operators created from Python land at (0, 0) on top of each other unless
        positioned, and these are created from Python. The anchor is computed from
        whatever else is in the component rather than hardcoded, because this
        component ships into projects whose layout this file cannot know.
        """
        generated = self._generatedDats()
        if not generated:
            return

        # Annotations are excluded from the anchor. They are backgrounds and
        # decoration rather than operators — a group annotation is deliberately
        # wider than what it encloses, and Envoy draws a mascot out of them — so
        # letting one set the anchor pushes the column off into empty space.
        others = [
            c
            for c in self.ownerComp.children
            if GENERATED_TAG not in c.tags and c.type != "annotate"
        ]
        if others:
            anchor_x = max(c.nodeX + c.nodeWidth for c in others) + _GRID
            anchor_y = max(c.nodeY + c.nodeHeight for c in others)
        else:
            anchor_x = anchor_y = 0
        anchor_x = int(math.ceil(float(anchor_x) / _GRID) * _GRID)

        # Step from the tallest actual tile, not a fixed offset — a column stepped
        # by less than its own tile height overlaps.
        tallest = max(d.nodeHeight for d in generated)
        step = int(math.ceil((tallest + _GAP) / float(_GRID)) * _GRID)

        for i, dat in enumerate(sorted(generated, key=lambda d: d.name)):
            dat.nodeX = anchor_x
            dat.nodeY = anchor_y - i * step
