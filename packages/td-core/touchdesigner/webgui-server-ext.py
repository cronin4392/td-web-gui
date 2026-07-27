"""
WebGuiServer extension — generates the operators the config implies.

Two families, both wholly derived from the config, so editing the config is the
whole of the work — nothing to create by hand, nothing to keep in sync:

WATCHERS, which carry TD -> web changes:

        REGISTRY  -> one Parameter Execute DAT per operator, watching exactly that
                     operator's registered parameters      (parameter-execute.py)
        READOUTS  -> one CHOP Execute DAT per CHOP, watching exactly the channels
                     those readouts read                   (chop-execute.py)
                  -> one DAT Execute DAT per DAT           (dat-execute.py)

STREAM CHAINS, which carry TD -> web video:

        STREAMS   -> one select_ / flip_ / videostreamout_ chain per stream,
                     built inside this component            (webrtc-callbacks.py)

Plus two operators that are not derived from the config but are what keep the
rest of them derived from it:

        config_watch  a DAT Execute DAT watching the `config` DAT, which re-runs
                      Rebuild whenever config.py changes on disk
                      (config-execute.py). The DAT already hot-reloads the file's
                      text; without this the two families above would stay as they
                      were at the last extension init, so an edited config would
                      look applied and behave as though it wasn't.
        exit_watch    an Execute DAT whose onExit drops every generated watcher
                      when TouchDesigner closes (exit-execute.py), so the saved
                      project holds none of them and the next open rebuilds them
                      from the live config. They are a build product; saving them
                      only preserves whatever the config said last time. Read that
                      file before relying on it — TouchDesigner has no pre-save
                      callback, which bounds what an exit hook can promise.

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

# The DAT Execute DAT that re-runs Rebuild when the config DAT's text changes,
# which — because that DAT syncs from config.py — means whenever the file is
# saved. Named for its role rather than with a watcher prefix: it is not one of
# the generated watchers, it is what generates them again.
#
# Table Change is the hook, because the DAT Execute DAT has no text-change
# callback. A Text DAT is a 1x1 table holding the whole file, so an edit to
# config.py reads as a cell change; see config-execute.py.
_CONFIG_WATCH_NAME = "config_watch"
_CONFIG_WATCH_FILE = _TDCOREDIR % "config-execute.py"

# The Execute DAT that deletes the generated watchers when TouchDesigner closes,
# so they are never saved into the project — they are a build product of the
# config, and Rebuild reproduces them on the next open. Named for its role, like
# the config watcher, and for the same reason: it is not one of the watchers.
#
# An Execute DAT's onExit is the only hook that distinguishes "the application is
# closing" from "this component is reinitializing"; see exit-execute.py, which
# also documents what that does and does not guarantee against a Save & Quit.
_EXIT_WATCH_NAME = "exit_watch"
_EXIT_WATCH_FILE = _TDCOREDIR % "exit-execute.py"

# The per-stream video chain, in flow order. STREAMS names a SOURCE TOP — the
# picture you want on the web — and these three ops are what turn it into a
# WebRTC track:
#
#       select_<id>          fetches the source TOP into this component
#       flip_<id>            flipx, because TD's WebRTC output arrives mirrored
#       videostreamout_<id>  the encoder, Mode = WebRTC
#
# The Select TOP is not decoration: a TOP cannot be wired across a COMP
# boundary, so fetching by reference is the only way the source can live wherever
# the project puts it while the chain lives in here.
#
# The flip is unconditional. TD's WebRTC output reaches the browser mirrored in X
# even though the TD viewer shows the source the right way round, so every stream
# needs it — and flipping at the encoder fixes every consumer of the stream,
# where the CSS transform Derivative's own webRTC palette component uses is
# dropped by Chrome on entering fullscreen and the mirror comes back
# (forum.derivative.ca/t/stunned-by-webrtcpanel/293915).
_SELECT_PREFIX = "select_"
_FLIP_PREFIX = "flip_"
_STREAMOUT_PREFIX = "videostreamout_"

# Encoder rate, pinned to a constant rather than left at the Video Stream Out
# TOP's default `me.time.rate` expression. At the default, every encoder runs at
# the project's frame rate — which is how a 60fps project with a wall of streams
# quietly spends its whole GPU budget on encoding.
_STREAM_FPS = 30

# Marks an operator as created and owned by this extension. Reconciliation only
# ever deletes operators carrying this tag — a generated component that deletes
# by name pattern alone eventually eats something a human made.
GENERATED_TAG = "webgui-generated"

# Marks the generated operators belonging to a STREAMS chain, so reconciliation
# can tell the two families apart. Only the stream side carries a role tag —
# a watcher is defined as "ours, and not a stream op", so anything of ours that
# is neither reads as an orphan and gets cleaned up rather than left behind.
STREAM_TAG = "webgui-stream"

# Marks the config watcher, for the same reason STREAM_TAG exists: reconciliation
# recognises a watcher as "ours and not something with a role tag", and the config
# watcher is a DAT Execute DAT pointed at a DAT — indistinguishable, on inspection
# alone, from a READOUTS watcher for an operator the config no longer mentions.
# Without a tag of its own it would be deleted as an orphan by the first Rebuild
# it triggered, which is a bridge that works exactly once.
CONFIG_TAG = "webgui-config-watch"

# Marks the exit watcher, for the same reason CONFIG_TAG exists — and here the
# consequence of omitting it is sharper than a bridge that works once: an Execute
# DAT names no operator, so _watchedBy reads it as an orphan, and it would be
# deleted by the very Rebuild that runs on open. It also has to be excluded from
# _generatedWatchers so that DestroyWatchers does not delete the DAT that is
# calling it, mid-callback, on the way out.
EXIT_TAG = "webgui-exit-watch"

# Shown on each generated operator, since the thing a reader most needs to know
# about an operator they didn't create is that editing it is pointless.
GENERATED_COMMENT = (
    "Generated from the config REGISTRY / READOUTS / STREAMS by "
    "WebGuiServerExt. Edits are overwritten on the next Rebuild."
)

# Layout: the generated operators sit right of the component's hand-built ones,
# watcher DATs in one column and stream chains in a second. Steps are computed
# from the tallest/widest actual tile rather than assumed, then snapped up to the
# 200 grid.
_GRID = 200

# Each generated DAT, and each stream chain, gets a companion "note" -- a comment
# annotation directly above it saying what it watches or carries. Comment mode:
# no title bar, since a one- or two-line description doesn't need one. Sized to
# hug its own operator (_NOTE_GAP_BELOW) while leaving a wide, unmistakable gap
# before the next one up the column (_NOTE_GAP_ABOVE) -- the asymmetry is what
# tells a reader which operator a note belongs to, without needing to draw a line
# between them.
_NOTE_WIDTH = 300
_NOTE_HEIGHT = 110
_NOTE_GAP_BELOW = 20
_NOTE_GAP_ABOVE = 150


class WebGuiServerExt:
    """Keeps the generated watcher DATs and video chains in step with the config."""

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

        Deliberately still a no-op now that DestroyWatchers() exists. onDestroyTD
        cannot tell an application close from a reinit, and reinit is overwhelmingly
        the common case, so this is the wrong place to call it from: the hook that
        means "TouchDesigner is closing" is an Execute DAT's onExit, which is what
        the generated exit_watch DAT is for.
        """
        pass

    # ── public ────────────────────────────────────────────────────────────────

    def Rebuild(self):
        """Make the generated operators match the config.

        Watcher DATs from REGISTRY + READOUTS, video chains from STREAMS, and the
        config watcher that calls this again the next time config.py is saved.

        Idempotent and diff-based: it compares what the config asks for against
        the operators that are live *right now*, and applies only the difference.
        It caches nothing between runs, which is what makes it safe under TDN —
        storage survives an import that deletes children, so a remembered "already
        built" flag would outlive the operators it described and leave the bridge
        silently dead. Reading the live network cannot go stale that way.

        Safe to call at any time, from any trigger, as often as you like. When
        nothing has changed it writes nothing.
        """
        # First, and outside the early-out below: a config that can't be read
        # right now is usually one being edited, and the watcher is what turns
        # fixing the file into a working component again instead of requiring a
        # manual Rebuild that nobody knows to run.
        config_watch = self._ensureConfigWatcher()
        # Likewise outside the early-out: the exit watcher is what keeps the
        # watchers out of the saved project, and an unreadable config is no reason
        # to save a stale set of them.
        exit_watch = self._ensureExitWatcher()

        desired = self._desiredWatches()
        if desired is None:
            chains = []  # config unreadable; _config() already explained why
        else:
            self._warnIfNoCoreDir()
            self._rebuildWatchers(desired)
            chains = self._rebuildStreams()

        # Reached on the unreadable-config path too. Layout only moves operators,
        # never deletes them, so it costs nothing there — and a config watcher
        # created moments ago would otherwise be left sitting at (0, 0).
        self._layout(chains, config_watch, exit_watch)

    def StreamTop(self, stream_id):
        """The generated Video Stream Out TOP carrying `stream_id`, or None.

        Public because webserver-callbacks.py points these TOPs at each
        negotiated peer and so has to find them. Keeping the name derivation here
        means the callbacks never spell the convention out a second time — and
        that renaming the chain is a change to this file alone.
        """
        return self.ownerComp.op(self._streamOpName(_STREAMOUT_PREFIX, stream_id))

    def DestroyWatchers(self):
        """Delete every generated watcher DAT, with the note captioning each.

        Public because the thing that calls it is a callback in another file —
        exit-execute.py, running from the generated exit_watch DAT when
        TouchDesigner closes. Keeping the definition of "what counts as a watcher"
        here means the callback never has to spell that rule out a second time.

        The watchers are a build product of REGISTRY and READOUTS, so dropping
        them costs nothing that Rebuild cannot reproduce — which is the whole
        argument for not saving them into the project in the first place. What is
        NOT dropped: the STREAMS chains (real network, not a callback bridge), and
        the config and exit watchers themselves, both excluded by tag from
        _generatedWatchers — the exit watcher most pointedly, since this runs from
        inside its own callback.

        Safe to call at any time. It leaves the component in a state Rebuild()
        restores exactly, which is also how it is tested without closing TD.
        """
        for dat in self._generatedWatchers():
            self._destroyWithNote(dat)

    # ── watchers ──────────────────────────────────────────────────────────────

    def _rebuildWatchers(self, desired):
        keep, orphans = self._matchExisting(desired)

        for dat in orphans:
            self._destroyWithNote(dat)

        # Keyed on (kind, op path), so one operator can legitimately carry two
        # watchers of different kinds and a CHOP path can never be mistaken for
        # the parameter watcher of an operator with the same path.
        for key in sorted(desired):
            dat = keep.get(key)
            if dat is None:
                dat = self._createWatcher(key)
            self._applyWatch(dat, key, desired[key])

    # ── config watcher ────────────────────────────────────────────────────────

    def _ensureConfigWatcher(self):
        """The DAT Execute DAT that re-runs Rebuild when config.py is saved.

        Created if missing, adopted by name if a previous one survived — the same
        lookup-or-create the stream chains use, and for the same reason: a TDN
        reimport of this component recreates its children, so anything that must
        outlive one has to be recoverable from what is on the network rather than
        from something remembered.

        Returns the DAT, or None when there is nothing to watch or the name is
        taken. Both are refusals rather than errors: raising out of here would
        take the whole Rebuild — watchers and streams included — down with it.
        """
        if self.ownerComp.op("config") is None:
            return None  # _config() reports the missing DAT when it's read
        dat = self.ownerComp.op(_CONFIG_WATCH_NAME)

        if dat is not None and not isinstance(dat, datexecuteDAT):
            debug(
                "WebGuiServerExt: '%s' is a %s, so config.py edits cannot be "
                "watched - rename it and Rebuild" % (_CONFIG_WATCH_NAME, dat.OPType)
            )
            return None
        if dat is None:
            dat = self.ownerComp.create(datexecuteDAT, _CONFIG_WATCH_NAME)
            dat.viewer = True
            dat.comment = (
                "Generated by WebGuiServerExt. Re-runs Rebuild when the config "
                "DAT changes, i.e. when config.py is saved. Edits are "
                "overwritten on the next Rebuild."
            )
        dat.tags.add(GENERATED_TAG)
        dat.tags.add(CONFIG_TAG)

        self._setPar(dat.par.dat, "config")
        self._setPar(dat.par.tablechange, 1)
        # End of Frame, so a save that reaches the DAT in more than one piece
        # rebuilds once. Same coalescing the READOUTS watchers get, and it matters
        # more here: a rebuild is orders of magnitude more work than a broadcast.
        self._setPar(dat.par.execute, "end")
        self._setPar(dat.par.active, 1)

        self._setExpr(dat.par.file, _CONFIG_WATCH_FILE)
        self._setPar(dat.par.syncfile, 1)

        self._setNoteText(
            self._getOrCreateNote(dat),
            "DAT: config\nre-runs Rebuild on every change, so saving config.py\n"
            "reaches the network without a restart",
        )
        return dat

    # ── exit watcher ──────────────────────────────────────────────────────────

    def _ensureExitWatcher(self):
        """The Execute DAT that drops the watchers when TouchDesigner closes.

        Created if missing, adopted by name if a previous one survived — the same
        lookup-or-create as the config watcher, and for the same reason: a TDN
        reimport recreates this component's children, so anything that must
        outlive one has to be recoverable from the network rather than remembered.

        Generated rather than hand-placed so that a project gets this behaviour by
        dropping the component in, with nothing to wire up. It is also why it must
        NOT be hand-placed: a Rebuild would see an untagged Execute DAT, fail to
        match it to any watched operator, and delete it as an orphan.

        Returns the DAT, or None if the name is taken by something else — a
        refusal rather than an error, because raising here would take the whole
        Rebuild, watchers and streams included, down with it.
        """
        dat = self.ownerComp.op(_EXIT_WATCH_NAME)
        if dat is not None and not isinstance(dat, executeDAT):
            debug(
                "WebGuiServerExt: '%s' is a %s, so the generated watchers cannot "
                "be dropped on exit - rename it and Rebuild" % (_EXIT_WATCH_NAME, dat.OPType)
            )
            return None
        if dat is None:
            dat = self.ownerComp.create(executeDAT, _EXIT_WATCH_NAME)
            dat.viewer = True
            dat.comment = (
                "Generated by WebGuiServerExt. Deletes the generated watcher DATs "
                "when TouchDesigner closes, so they are never saved into the "
                "project. Edits are overwritten on the next Rebuild."
            )
        dat.tags.add(GENERATED_TAG)
        dat.tags.add(EXIT_TAG)

        # Exit alone. Every other Execute DAT hook is left off: this DAT has one
        # job, and Start/Create in particular would race the deferred Rebuild in
        # onInitTD rather than add anything.
        self._setPar(dat.par.exit, 1)
        self._setPar(dat.par.active, 1)

        self._setExpr(dat.par.file, _EXIT_WATCH_FILE)
        self._setPar(dat.par.syncfile, 1)

        self._setNoteText(
            self._getOrCreateNote(dat),
            "on TouchDesigner exit: deletes the generated watcher DATs,\n"
            "so the saved project holds none and the next open\n"
            "rebuilds them from the live config",
        )
        return dat

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

    def _generatedWatchers(self):
        """Every watcher DAT we own — ours, and carrying no other role tag.

        By exclusion rather than by a role tag of its own, so that anything of
        ours which is neither a watcher, a chain op, nor one of the two role-tagged
        bridge DATs reads as an orphan to be cleaned up rather than as something to
        leave alone.

        This is also the set DestroyWatchers deletes on the way out, which is why
        the config and exit watchers must be excluded by tag: they are what makes
        the next open able to rebuild everything this returns.
        """
        return [
            c
            for c in self.ownerComp.children
            if GENERATED_TAG in c.tags
            and STREAM_TAG not in c.tags
            and CONFIG_TAG not in c.tags
            and EXIT_TAG not in c.tags
        ]

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
        for dat in self._generatedWatchers():
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
        dat.viewer = True
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

    # ── notes ─────────────────────────────────────────────────────────────────

    def _noteName(self, host):
        """Name of the comment annotation documenting one generated operator."""
        return tdu.validName(host.name + "_note")

    def _findUtilityChild(self, name):
        """Look up a direct utility child (e.g. a note annotation) by name.

        Utility ops — annotations among them — are invisible to op() and
        .children, so a plain attribute or dict lookup can't find them.
        findChildren(includeUtility=True) is the call that does see them, but it
        also recurses into an annotate's own internal widget network; maxDepth=1
        keeps this to direct children of the component only.
        """
        for child in self.ownerComp.findChildren(includeUtility=True, maxDepth=1):
            if child.name == name:
                return child
        return None

    def _getOrCreateNote(self, host):
        """The comment annotation for one generated operator, creating it if missing.

        Looked up fresh and recreated on demand rather than cached: a TDN
        reimport of this component (see onInitTD) recreates the children from the
        .tdn, which has no notion of these hand-attached notes, so a note can
        vanish out from under Rebuild between runs. Idempotent lookup-or-create
        is what makes that self-healing rather than a one-time setup step that
        silently stops matching reality.
        """
        name = self._noteName(host)
        note = self._findUtilityChild(name)
        if note is None:
            note = self.ownerComp.create(annotateCOMP, name)
            note.name = name  # create() ignores the name arg for annotateCOMP
            note.utility = True
            note.tags.add(GENERATED_TAG)
            note.par.Mode = "comment"
        return note

    def _destroyWithNote(self, host):
        """Destroy a generated operator and the note captioning it, if any.

        Together, because a note outliving its host is a caption pointing at
        nothing — and one that Rebuild would never look at again, so it would sit
        there describing a watcher or a stream the config dropped.
        """
        note = self._findUtilityChild(self._noteName(host))
        if note is not None:
            note.destroy()
        host.destroy()

    def _watchText(self, key, watch):
        """Body text for a watcher's note: which op, and what it watches."""
        kind, path = key
        if kind == _PAREXEC:
            return "OP: %s\nparameters: %s" % (path, ", ".join(watch["pars"]))
        if kind == _CHOPEXEC:
            return "CHOP: %s\nchannels: %s" % (path, ", ".join(watch["chans"]))
        return "DAT: %s\nwatches: whole table (Table Change)" % path

    def _setNoteText(self, note, text):
        if note.par.Bodytext.eval() != text:
            note.par.Bodytext = text

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

        self._setNoteText(self._getOrCreateNote(dat), self._watchText(key, watch))

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

    # ── streams ───────────────────────────────────────────────────────────────

    def _streams(self):
        """The config's STREAMS map: stream id -> {'source': ..., 'label': ...}.

        Optional config — a project can expose params and no video at all.
        """
        config = self._config()
        return getattr(config, "STREAMS", {}) if config is not None else {}

    def _streamOpName(self, prefix, stream_id):
        """A legal operator name for one stage of one stream's chain."""
        return tdu.validName(prefix + stream_id)

    def _streamSource(self, stream_id, info):
        """The path of the TOP a stream carries, or None if the entry names none."""
        source = info.get("source")
        if not source:
            debug("WebGuiServerExt: stream '%s' has no 'source' TOP" % stream_id)
            return None
        return source

    def _rebuildStreams(self):
        """Make the generated video chains match the config's STREAMS.

        Returns the live chains as a list of [select, flip, videostreamout], in
        the config's stream order, for _layout to place. Diff-based like the
        watchers: a stream dropped from the config takes its three operators with
        it, so shrinking a wall is as supported as growing one.

        Matched by NAME rather than by what each op points at, which is the
        opposite of how the watchers match. The difference is that a watcher's
        identity is the operator it watches — a DAT someone renamed is still
        doing its job — whereas a chain's identity IS its stream id, and the id
        is in the name. There is nothing else in a Select TOP to recognise it by.
        """
        chains = []
        wanted = set()
        for stream_id, info in self._streams().items():
            source = self._streamSource(stream_id, info)
            if source is None:
                continue  # _streamSource already explained why
            chain = self._applyStream(stream_id, info, source)
            if chain is None:
                continue  # _applyStream already explained why
            chains.append(chain)
            wanted.update(o.name for o in chain)

        # Also sweeps up the stages of a chain that was abandoned part-built
        # above, since those never reached `wanted` — which is why a refused
        # stream leaves no half-chain behind.
        for o in self.ownerComp.children:
            if STREAM_TAG in o.tags and o.name not in wanted:
                self._destroyWithNote(o)

        return chains

    def _getOrCreateStreamOp(self, optype, prefix, stream_id):
        """One stage of one stream's chain, created if missing. None on a clash.

        A stage found by name is adopted and re-tagged rather than rebuilt, which
        is what carries a chain across a TDN reimport that dropped our tags. But
        an operator of the WRONG type under that name is someone else's — writing
        `flipx` to it would raise out of Rebuild and take the whole extension
        init down with it, so the stream is refused by name instead.
        """
        name = self._streamOpName(prefix, stream_id)
        o = self.ownerComp.op(name)
        if o is not None and not isinstance(o, optype):
            debug(
                "WebGuiServerExt: stream '%s' needs to create '%s', but a %s "
                "already has that name - rename it, or rename the stream"
                % (stream_id, name, o.OPType)
            )
            return None
        if o is None:
            o = self.ownerComp.create(optype, name)
            o.comment = GENERATED_COMMENT
        o.tags.add(GENERATED_TAG)
        o.tags.add(STREAM_TAG)
        return o

    def _wire(self, source, dest):
        """Connect source -> dest's first input, unless it already is.

        Rewiring an already-correct connection would dirty the chain on every
        Rebuild, and a Rebuild runs on every extension reinit. Compared by .id
        rather than identity, since two lookups of one operator need not hand
        back the same Python wrapper.
        """
        if dest.inputs and dest.inputs[0].id == source.id:
            return
        dest.inputConnectors[0].connect(source)

    def _applyStream(self, stream_id, info, source):
        """Build (or update) one stream's select -> flip -> videostreamout chain.

        Returns the three operators in flow order, or None if any of them could
        not be created — see _getOrCreateStreamOp.
        """
        select = self._getOrCreateStreamOp(selectTOP, _SELECT_PREFIX, stream_id)
        flip = self._getOrCreateStreamOp(flipTOP, _FLIP_PREFIX, stream_id)
        out = self._getOrCreateStreamOp(videostreamoutTOP, _STREAMOUT_PREFIX, stream_id)
        if select is None or flip is None or out is None:
            return None

        self._setPar(select.par.top, source)
        self._setPar(flip.par.flipx, 1)

        self._setPar(out.par.mode, "webrtc")
        self._setPar(out.par.fps, _STREAM_FPS)
        self._setPar(out.par.active, 1)
        # webrtc / webrtcconnection / webrtcvideotrack are deliberately NOT set
        # here. They are per-peer, they are menus the WebRTC DAT populates only
        # once a connection exists, and webserver-callbacks.attach_streams sets
        # them a frame after each negotiation. Writing them from a Rebuild would
        # cut the live peer's video every time this file is edited.

        self._wire(select, flip)
        self._wire(flip, out)

        self._setNoteText(self._getOrCreateNote(select), self._streamText(stream_id, info, source))
        return [select, flip, out]

    def _streamText(self, stream_id, info, source):
        """Body text for a stream chain's note: which stream, from which TOP."""
        return "stream: %s (%s)\nsource: %s\nflipx -> WebRTC track '%s' @ %d fps" % (
            stream_id,
            info.get("label", stream_id),
            source,
            stream_id,
            _STREAM_FPS,
        )

    # ── layout ────────────────────────────────────────────────────────────────

    def _layout(self, chains, config_watch, exit_watch):
        """Place the generated operators right of the hand-built ones.

        Three columns, left to right: the config/exit watchers that drive
        Rebuild's lifecycle, the per-config watcher DATs they drive, then the
        stream chains, one row per stream.

        Operators created from Python land at (0, 0) on top of each other unless
        positioned, and these are created from Python. The anchor is computed from
        whatever else is in the component rather than hardcoded, because this
        component ships into projects whose layout this file cannot know.
        """
        # Annotations are excluded from the anchor. They are backgrounds and
        # decoration rather than operators — a group annotation is deliberately
        # wider than what it encloses, and Envoy draws a mascot out of them — so
        # letting one set the anchor pushes the columns off into empty space.
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

        # A note is centred on its host, so every column is _NOTE_WIDTH wide
        # however narrow its DATs are. Clearing that, plus a grid step, before
        # starting the next column is what keeps neighbouring columns from
        # sharing a note's airspace.
        watchers_x = anchor_x + _NOTE_WIDTH + _GRID
        chains_x = watchers_x + _NOTE_WIDTH + _GRID

        self._layoutLifecycleWatchers(anchor_x, anchor_y, config_watch, exit_watch)
        self._layoutWatchers(watchers_x, anchor_y)
        self._layoutChains(chains_x, anchor_y, chains)

    def _rowStep(self, ops):
        """Vertical step that clears the tallest of `ops` plus its note.

        Computed rather than fixed: a column stepped by less than one tile + its
        note overlaps, and the tiles here range from a 90-tall TOP to whatever
        height a Parameter Execute DAT's viewer is opened to.
        """
        tallest = max(o.nodeHeight for o in ops)
        unit = tallest + _NOTE_GAP_BELOW + _NOTE_HEIGHT + _NOTE_GAP_ABOVE
        return int(math.ceil(unit / float(_GRID)) * _GRID)

    def _placeNote(self, host, x):
        """Put a generated operator's note directly above it, centred on it.

        The note may not exist yet on a component whose config was just widened —
        created here too, so layout alone is enough to keep everything captioned
        rather than only the entries a given Rebuild happened to touch.
        """
        note = self._getOrCreateNote(host)
        note.nodeX = x - (_NOTE_WIDTH - host.nodeWidth) // 2
        note.nodeY = host.nodeY + host.nodeHeight + _NOTE_GAP_BELOW
        note.nodeWidth = _NOTE_WIDTH
        note.nodeHeight = _NOTE_HEIGHT

    def _layoutLifecycleWatchers(self, x, top_y, config_watch, exit_watch):
        """The config/exit watcher column, left of the per-config watchers.

        A column of its own rather than rows pinned atop the watcher column:
        these two aren't watchers over anything in the config, they're what
        builds and tears down the ones that are, so they read as upstream of
        that column rather than sorted in among its contents.
        """
        pinned = [w for w in (exit_watch, config_watch) if w is not None]
        if not pinned:
            return

        step = self._rowStep(pinned)
        for i, dat in enumerate(pinned):
            dat.nodeX = x
            dat.nodeY = top_y - i * step
            self._placeNote(dat, x)

    def _layoutWatchers(self, x, top_y):
        """The per-config watcher column: one row per REGISTRY/READOUTS watch."""
        watchers = sorted(self._generatedWatchers(), key=lambda d: d.name)
        if not watchers:
            return

        step = self._rowStep(watchers)
        for i, dat in enumerate(watchers):
            dat.nodeX = x
            dat.nodeY = top_y - i * step
            self._placeNote(dat, x)

    def _layoutChains(self, x, top_y, chains):
        """One row per stream, flowing left to right in the config's order.

        Config order rather than alphabetical, because STREAMS' insertion order
        is already load-bearing — webrtc-callbacks zips it against the video
        m-lines of the negotiated SDP — so a wall read top to bottom here is the
        wall the browser numbers the same way.
        """
        if not chains:
            return

        ops = [o for chain in chains for o in chain]
        step_x = int(math.ceil((max(o.nodeWidth for o in ops) + _GRID) / float(_GRID)) * _GRID)
        step_y = self._rowStep(ops)

        for i, chain in enumerate(chains):
            for j, o in enumerate(chain):
                o.nodeX = x + j * step_x
                o.nodeY = top_y - i * step_y
            self._placeNote(chain[0], x)
