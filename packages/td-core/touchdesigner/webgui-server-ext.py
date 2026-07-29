"""
WebGuiServer extension — generates the operators the config implies.

WATCHERS carry TD -> web changes: one Parameter Execute DAT per operator
(parameter-execute.py), one CHOP/DAT Execute DAT per readout (chop-execute.py,
dat-execute.py). STREAM CHAINS carry TD -> web video: one
select/fit/flip/videostreamout chain per STREAMS entry (webrtc-callbacks.py).

Three more operators aren't derived from the config but keep the above derived
from it: config_watch re-runs Rebuild when config.py changes on disk
(config-execute.py); exit_watch re-runs Rebuild on Create (covers an External
.tox reinit, which recreates children but not the extension) and deletes every
generated op on Exit so none of it saves into the project (exit-execute.py; read
that file before relying on the Exit half — TD has no pre-save callback); pre_release
is Embody's export hook, dropping the same build product from a staged .tox copy
so a shipped component doesn't carry another project's watchers (pre-release.py).

Nothing here is project specific. Reads the same config as the callbacks, via
`op.WebGuiServer`.

Set on the WebGuiServer component: Tdcoredir (Folder par) — where the three
callback scripts above resolve from, and where every generated DAT syncs its
text, so editing one of those files hot-reloads every DAT built from it.

One DAT per operator rather than one covering all of them, because a Parameter/CHOP
Execute DAT's OPs/Parameters (or CHOP/Channel) fields are a cross product — a
single DAT would watch every named parameter or channel on every operator it
covers, and built-in names (`file`, `index`) collide constantly. Correctness
doesn't depend on this (broadcast re-checks the operator and name before sending)
but the watch stays legible and cheap.
"""

import math

# Resolved inside Tdcoredir as an expression (not a baked path) so repointing
# Tdcoredir moves every generated DAT's source at once.
_TDCOREDIR = "op.WebGuiServer.par.Tdcoredir.eval() + '/%s'"

# Each kind names its target through a different par, which is also how
# _watchedBy tells kinds apart without a tag that could go stale.
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

# Named for its role, not a watcher prefix: it generates the watchers, it isn't one.
_CONFIG_WATCH_NAME = "config_watch"
_CONFIG_WATCH_FILE = _TDCOREDIR % "config-execute.py"

# Parent shortcut, unlike the generated DATs' global op. shortcut: this DAT lives
# inside the component so it can resolve upward to its OWN WebGuiServer, letting
# two instances in one project each read their own Config File.
_CONFIG_FILE_EXPR = "parent.WebGuiServer.par.Configfile"

_EXIT_WATCH_NAME = "exit_watch"
_EXIT_WATCH_FILE = _TDCOREDIR % "exit-execute.py"

# Name is not ours to choose — Embody looks for a Text DAT named exactly this,
# among the exported COMP's direct children.
_RELEASE_HOOK_NAME = "pre_release"
_RELEASE_HOOK_FILE = _TDCOREDIR % "pre-release.py"

# Per-stream chain, in flow order: select_ fetches the source TOP across the COMP
# boundary, fit_ bounds the resolution the encoder sees, flip_ unmirrors it (TD's
# WebRTC output is mirrored in X even though the viewer isn't —
# forum.derivative.ca/t/stunned-by-webrtcpanel/293915), and videostreamout_
# encodes it.
_SELECT_PREFIX = "select_"
_FIT_PREFIX = "fit_"
_FLIP_PREFIX = "flip_"
_STREAMOUT_PREFIX = "videostreamout_"

# Defaults for the per-stream 'width' and 'fps' keys. Both exist because the
# Video Stream Out TOP is expensive per pixel and per frame, and a wall of them
# at project resolution and project rate eats the whole GPU budget — fps is also
# pinned rather than left at the TOP's default me.time.rate expression.
_STREAM_WIDTH = 480
_STREAM_FPS = 15

# Reconciliation only deletes operators carrying this tag.
GENERATED_TAG = "webgui-generated"

# Distinguishes a STREAMS chain op from a watcher — a watcher is "ours and not a
# stream op", so anything of ours that's neither reads as an orphan.
STREAM_TAG = "webgui-stream"

# Without this, config_watch (a DAT Execute DAT pointed at a DAT) would be
# indistinguishable from an orphaned READOUTS watcher and get deleted by the
# first Rebuild it triggers.
CONFIG_TAG = "webgui-config-watch"

# Without this, exit_watch (an Execute DAT naming no operator) reads as an
# orphan and gets deleted by the Rebuild that runs on open. Also excluded from
# _generatedWatchers so DestroyGenerated doesn't delete it mid-callback.
EXIT_TAG = "webgui-exit-watch"

# Same reasoning as EXIT_TAG: pre_release names no operator, so it needs the tag
# to survive Rebuild, and the exclusion from _generatedWatchers so the export
# hook doesn't delete itself mid-callback.
RELEASE_TAG = "webgui-pre-release"

GENERATED_COMMENT = (
    "Generated from the config REGISTRY / READOUTS / STREAMS by "
    "WebGuiServerExt. Edits are overwritten on the next Rebuild."
)

_GRID = 200

# Notes hug their host below (_NOTE_GAP_BELOW) but leave a wide gap above the
# next row up (_NOTE_GAP_ABOVE) — the asymmetry alone shows which op a note belongs to.
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
        # Deferred: a TDN-strategy COMP's ImportNetwork(clear_first=True) can
        # delete/recreate every child right after init, discarding immediate work.
        # No fixed delay can honestly outwait project open (ReconstructTDNComps
        # runs at frame 60) — correctness comes from Rebuild being idempotent and
        # re-running after the later reinit, not from guessing the right delay.
        run("args[0].Rebuild()", self, delayFrames=5)

    def onDestroyTD(self):
        # No-op deliberately: this can't tell an application close from a plain
        # reinit (the common case), and the generated DATs are meant to outlive
        # a reinit. "TD is closing" is exit_watch's onExit, not this.
        pass

    # ── public ────────────────────────────────────────────────────────────────

    def Rebuild(self):
        """Make the generated operators match the config. Idempotent, diff-based,
        safe to call from anywhere at any time; writes nothing when nothing changed."""
        # An extension can outlive its component (onInitTD's Rebuild is deferred
        # 5 frames), and the pre_release hook opens that window every export by
        # scheduling a Rebuild against a copy Embody is about to delete.
        if not self.ownerComp.valid:
            return

        # Restores the config DAT's link to config.py, which a .tox export strips.
        self._ensureConfigSource()

        config_watch = self._ensureConfigWatcher()
        exit_watch = self._ensureExitWatcher()
        release_hook = self._ensureReleaseHook()

        desired = self._desiredWatches()
        if desired is None:
            chains = []  # config unreadable; _config() already explained why
        else:
            self._warnIfNoCoreDir()
            self._rebuildWatchers(desired)
            chains = self._rebuildStreams()

        self._layout(chains, [exit_watch, config_watch, release_hook])

    def StreamTop(self, stream_id):
        """The generated Video Stream Out TOP carrying `stream_id`, or None."""
        return self.ownerComp.op(self._streamOpName(_STREAMOUT_PREFIX, stream_id))

    def Call(self, name, args=None, on_result=None, on_error=None, client=None, timeout=10.0):
        """Invoke a named handler the web page registered (via `createTDHandler`
        or `connection.handle()`), replying through `on_result`/`on_error` —
        never blocking. Delegates to the callbacks module's `call()` so project
        code writes `parent.WebGuiServer.Call(...)` rather than reaching through
        `op.WebGuiServer.op('webserver1_callbacks').module`."""
        callbacks = self._callbacks()
        if callbacks is None:
            return
        callbacks.call(
            name, args=args, on_result=on_result, on_error=on_error, client=client, timeout=timeout
        )

    def Notify(self, name, args=None, client=None):
        """Invoke a named handler the web page registered, with no reply
        expected. Broadcasts to every connected client by default."""
        callbacks = self._callbacks()
        if callbacks is None:
            return
        callbacks.notify(name, args=args, client=client)

    def DestroyGenerated(self, comp=None):
        """Delete every generated watcher DAT and stream chain, notes included.
        Called from exit-execute.py's onExit, and from pre-release.py against a
        staged .tox copy — see `comp`. Leaves the component exactly as Rebuild()
        would restore it.

        `comp` targets a component other than our own: Embody stages a .tox copy
        under /sys/quiet with cooking disabled, so that copy's own extension can
        never compile, and its pre_release hook borrows the live extension
        instead, pointing it at the copy. (Embody clears the copy's opshortcut,
        so op.WebGuiServer still resolves to the live component during this call.)
        """
        for dat in self._generatedWatchers(comp):
            self._destroyWithNote(dat)
        for chain_op in self._generatedStreamOps(comp):
            self._destroyWithNote(chain_op)

    # ── watchers ──────────────────────────────────────────────────────────────

    def _rebuildWatchers(self, desired):
        keep, orphans = self._matchExisting(desired)

        for dat in orphans:
            self._destroyWithNote(dat)

        # Keyed on (kind, op path) so one operator can carry two watcher kinds.
        for key in sorted(desired):
            dat = keep.get(key)
            if dat is None:
                dat = self._createWatcher(key)
            self._applyWatch(dat, key, desired[key])

    # ── config source ─────────────────────────────────────────────────────────

    def _ensureConfigSource(self):
        """Point the `config` DAT's File par at the component's Config File par.

        Re-asserted every Rebuild because Embody's .tox export strips relative
        file/syncfile references, and exit_watch's onCreate runs Rebuild the
        moment the component lands in a project — so the strip is a non-event.
        Safe against an unresolved path: a Text DAT with syncfile keeps its
        existing text rather than clearing.
        """
        dat = self.ownerComp.op("config")
        if dat is None:
            return  # _config() reports the missing DAT when it's read

        self._setExpr(dat.par.file, _CONFIG_FILE_EXPR)
        self._setPar(dat.par.syncfile, 1)

    # ── config watcher ────────────────────────────────────────────────────────

    def _ensureConfigWatcher(self):
        """Create or adopt the DAT Execute DAT that re-runs Rebuild when config.py
        is saved. Returns None (rather than raising) when the config DAT is
        missing or the name is taken by the wrong type."""
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
        self._setPar(dat.par.execute, "end")  # coalesce a multi-part save into one rebuild
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
        """Create or adopt the Execute DAT bookending the build product's
        lifecycle: Create rebuilds it, Exit drops it.

        Create covers reloading this component from an External .tox while
        live: that reload recreates every child (Create fires again) but does
        NOT recompile the extension, so onInitTD never fires — routing through
        this DAT's onCreate needs no extension access, just a node existing.
        Start is left off since onInitTD already covers genuine startup.

        Returns None (rather than raising) when the name is taken by the wrong type.
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
                "Generated by WebGuiServerExt. Rebuilds on Create (covers an "
                "External .tox reinit, which reruns Create but not onInitTD), "
                "and deletes the generated watchers and stream chains on Exit, "
                "so TouchDesigner closing never saves them. Edits are "
                "overwritten on the next Rebuild."
            )
        dat.tags.add(GENERATED_TAG)
        dat.tags.add(EXIT_TAG)

        self._setPar(dat.par.create, 1)
        self._setPar(dat.par.exit, 1)
        self._setPar(dat.par.active, 1)

        self._setExpr(dat.par.file, _EXIT_WATCH_FILE)
        self._setPar(dat.par.syncfile, 1)

        self._setNoteText(
            self._getOrCreateNote(dat),
            "on Create: re-runs Rebuild (covers a live External .tox reinit)\n"
            "on Exit: deletes the generated watchers and streams, so the\n"
            "next open rebuilds them fresh from the live config",
        )
        return dat

    # ── release hook ──────────────────────────────────────────────────────────

    def _ensureReleaseHook(self):
        """Create or adopt the pre_release Text DAT Embody looks for on export.
        Carries no callbacks; it exists to be found by name, type, and file —
        everything else is in pre-release.py. Returns None on a name clash."""
        dat = self.ownerComp.op(_RELEASE_HOOK_NAME)
        if dat is not None and not isinstance(dat, textDAT):
            debug(
                "WebGuiServerExt: '%s' is a %s, not a Text DAT, so Embody will "
                "ignore it and exported .tox files will carry the generated "
                "watchers and streams - rename it and Rebuild" % (_RELEASE_HOOK_NAME, dat.OPType)
            )
            return None
        if dat is None:
            dat = self.ownerComp.create(textDAT, _RELEASE_HOOK_NAME)
            dat.comment = (
                "Generated by WebGuiServerExt. Embody's pre_release export hook: "
                "drops the generated watchers and stream chains from the staged "
                "copy so they never ship in a .tox. Edits are overwritten on the "
                "next Rebuild."
            )
        dat.tags.add(GENERATED_TAG)
        dat.tags.add(RELEASE_TAG)

        self._setExpr(dat.par.file, _RELEASE_HOOK_FILE)
        self._setPar(dat.par.syncfile, 1)

        self._setNoteText(
            self._getOrCreateNote(dat),
            "Embody pre_release hook\ndrops the generated watchers and streams from the\n"
            "staged copy, so a .tox ships the machinery, not its output",
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
        """The Web Server DAT's callbacks module — owns par_names() and
        readout_watches() so that logic exists in exactly one place."""
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
        """True if custom, False if built-in. TD enforces the casing this reads —
        custom parameter names must start uppercase — so this works even for
        operators that don't exist yet, with no parameter to interrogate."""
        return bool(par_name) and par_name[0].isupper()

    def _parNames(self, entry):
        """Parameter names a watcher must list for one registry entry.

        A 'number[]' entry names a ParGroup ('Color') whose actual components are
        'Colorr' etc — watching the group name watches nothing, so it's expanded
        via the callbacks module, which already owns that resolution.
        """
        callbacks = self._callbacks()
        if callbacks is not None:
            names = callbacks.par_names(entry)
            if names:
                return names

        # Operator/parameter not resolvable right now; fall back to the
        # registry's own spelling. A ParGroup falls back to a prefix glob, which
        # over-matches harmlessly — broadcast_param_change re-checks before sending.
        if entry["type"] == "number[]":
            return [entry["par"] + "*"]
        return [entry["par"]]

    def _readoutWatches(self):
        """What READOUTS asks for: op path -> {'family', 'chans'}."""
        # getattr guards a callbacks DAT that predates readouts, so a params-only
        # project doesn't break on a missing readout_watches().
        callbacks = self._callbacks()
        watches = getattr(callbacks, "readout_watches", None) if callbacks else None
        return watches() if watches else {}

    def _desiredWatches(self):
        """What the config asks for: (kind, op path) -> watch spec. None when the
        config can't be read, so the caller leaves the network alone instead of
        deleting every watcher against an empty config."""
        config = self._config()
        if config is None:
            return None

        watches = {}
        for entry in config.REGISTRY.values():
            # Pulses fire On Pulse, not Value Change, and hold no state to broadcast.
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
            # A DAT Execute DAT ignores this list (watches the whole table); kept
            # so both readout kinds share one shape here.
            for chan in readout["chans"]:
                if chan not in watch["chans"]:
                    watch["chans"].append(chan)

        return watches

    # ── reconciliation ────────────────────────────────────────────────────────

    def _generatedWatchers(self, comp=None):
        """Every watcher DAT we own: ours, and carrying no other role tag —
        anything of ours that's neither a watcher, a chain op, nor one of the
        role-tagged bridge DATs reads as an orphan.

        Notes are excluded by type, not tag: copying the component drops the
        `utility` flag, so on a copy a note would otherwise read as a watcher
        and get destroyed twice — once as itself, once as its host's note,
        which raises on the already-deleted op and would abort an export.
        """
        return [
            c
            for c in (comp or self.ownerComp).children
            if GENERATED_TAG in c.tags
            and c.type != "annotate"
            and STREAM_TAG not in c.tags
            and CONFIG_TAG not in c.tags
            and EXIT_TAG not in c.tags
            and RELEASE_TAG not in c.tags
        ]

    def _generatedStreamOps(self, comp=None):
        """The other half of DestroyGenerated's set: every stream-chain op we own."""
        return [c for c in (comp or self.ownerComp).children if STREAM_TAG in c.tags]

    def _watchedBy(self, dat):
        """The (kind, watched op path) an existing generated DAT stands for, read
        off the operator itself (not a tag, so it can't go stale) and matched by
        path rather than name — a renamed DAT is still doing its job."""
        for kind, spec in _WATCH.items():
            # .val, not .eval(): these are OP-style pars, whose eval() resolves to
            # operators rather than the configured path string.
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
                orphans.append(dat)
        return keep, orphans

    def _datName(self, kind, path):
        """A legal, collision-free DAT name derived from the full watched op path."""
        return tdu.validName(_WATCH[kind]["prefix"] + path.strip("/").replace("/", "_"))

    def _createWatcher(self, key):
        kind, path = key
        dat = self.ownerComp.create(_WATCH[kind]["optype"], self._datName(kind, path))
        dat.viewer = True
        dat.tags.add(GENERATED_TAG)
        dat.comment = GENERATED_COMMENT
        return dat

    def _setPar(self, par, value):
        # Compared against .val (not .eval()): the OPs par is OP-style, whose
        # eval() resolves to a list of operators, never equal to the path string.
        if par.mode != ParMode.CONSTANT or par.val != value:
            par.val = value

    def _setExpr(self, par, expr):
        if par.mode != ParMode.EXPRESSION or par.expr != expr:
            par.expr = expr

    # ── notes ─────────────────────────────────────────────────────────────────

    def _noteName(self, host):
        return tdu.validName(host.name + "_note")

    def _findUtilityChild(self, name, comp=None):
        """Look up a direct utility child (e.g. a note annotation) by name.
        Utility ops are invisible to op()/.children, so this needs
        findChildren(includeUtility=True); maxDepth=1 avoids recursing into an
        annotate's internal widget network. Skips stale (already-deleted)
        matches, which DestroyGenerated's delete loop produces routinely."""
        for child in (comp or self.ownerComp).findChildren(includeUtility=True, maxDepth=1):
            if child.valid and child.name == name:
                return child
        return None

    def _getOrCreateNote(self, host):
        """The comment annotation for one generated operator, creating it if
        missing — looked up fresh each time since a TDN reimport can drop these
        hand-attached notes without recreating them."""
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
        """Destroy a generated operator and its caption note together, so no note
        is left pointing at nothing. Looked up beside the host (not `self`) so
        this also works against DestroyGenerated's staged-copy target."""
        note = self._findUtilityChild(self._noteName(host), host.parent())
        if note is not None:
            note.destroy()
        host.destroy()

    def _watchText(self, key, watch):
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
            self._setPar(dat.par.valuechange, 1)
        elif kind == _CHOPEXEC:
            self._setPar(dat.par.channel, " ".join(watch["chans"]))
            self._setPar(dat.par.valuechange, 1)
        else:
            # Table Change alone: as of 2025.30000 the other four (Row/Column/
            # Cell/Size Change) are deprecated in its favor.
            self._setPar(dat.par.tablechange, 1)
            self._setPar(dat.par.execute, "end")  # coalesce a table rewritten cell by cell

        self._setPar(dat.par.active, 1)

        self._setExpr(dat.par.file, spec["file"])
        self._setPar(dat.par.syncfile, 1)

        self._setNoteText(self._getOrCreateNote(dat), self._watchText(key, watch))

    def _warnIfNoCoreDir(self):
        """Warn once per rebuild when Tdcoredir can't supply a source path — the
        File expression is set regardless, this only makes the mistake actionable."""
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
        """The config's STREAMS map: stream id ->
        {'source': ..., 'label': ..., 'width': ..., 'fps': ...}."""
        config = self._config()
        return getattr(config, "STREAMS", {}) if config is not None else {}

    def _streamOpName(self, prefix, stream_id):
        return tdu.validName(prefix + stream_id)

    def _streamSource(self, stream_id, info):
        source = info.get("source")
        if not source:
            debug("WebGuiServerExt: stream '%s' has no 'source' TOP" % stream_id)
            return None
        return source

    def _streamLimit(self, stream_id, info, key, default):
        """One stream's 'width' or 'fps' cap, falling back to the default when
        the config omits it or names something that isn't a positive number."""
        if key not in info:
            return default
        try:
            value = int(info[key])
        except (TypeError, ValueError):
            value = 0
        if value <= 0:
            debug(
                "WebGuiServerExt: stream '%s' has a bad '%s' (%r) - using %d"
                % (stream_id, key, info[key], default)
            )
            return default
        return value

    def _rebuildStreams(self):
        """Make the generated video chains match STREAMS. Returns the live chains
        (each [select, fit, flip, videostreamout]) in config order for _layout.
        Matched by NAME rather than target, unlike the watchers — a chain's
        identity IS its stream id, which is in the name."""
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

        # Also sweeps up a chain abandoned part-built above, which never reached `wanted`.
        for o in self.ownerComp.children:
            if STREAM_TAG in o.tags and o.name not in wanted:
                self._destroyWithNote(o)

        return chains

    def _getOrCreateStreamOp(self, optype, prefix, stream_id):
        """One stage of one stream's chain, created if missing, adopted by name if
        it survived a TDN reimport. Refused (returns None) rather than rebuilt
        when the name is taken by the wrong type — that operator belongs to
        someone else."""
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
        # Compared by .id, not identity: two lookups of one operator need not
        # hand back the same Python wrapper.
        if dest.inputs and dest.inputs[0].id == source.id:
            return
        dest.inputConnectors[0].connect(source)

    def _applyStream(self, stream_id, info, source):
        """Build or update one stream's select -> fit -> flip -> videostreamout
        chain. Returns the four operators, or None if any could not be created."""
        select = self._getOrCreateStreamOp(selectTOP, _SELECT_PREFIX, stream_id)
        fit = self._getOrCreateStreamOp(fitTOP, _FIT_PREFIX, stream_id)
        flip = self._getOrCreateStreamOp(flipTOP, _FLIP_PREFIX, stream_id)
        out = self._getOrCreateStreamOp(videostreamoutTOP, _STREAMOUT_PREFIX, stream_id)
        if select is None or fit is None or flip is None or out is None:
            return None

        width = self._streamLimit(stream_id, info, "width", _STREAM_WIDTH)
        fps = self._streamLimit(stream_id, info, "fps", _STREAM_FPS)

        self._setPar(select.par.top, source)

        # Limit rather than Custom: aspect is preserved and a source already
        # under the cap is left alone rather than upscaled. Height gets the same
        # value so a portrait source is bounded on its long side too.
        self._setPar(fit.par.outputresolution, "limit")
        self._setPar(fit.par.resolutionw, width)
        self._setPar(fit.par.resolutionh, width)

        self._setPar(flip.par.flipx, 1)

        self._setPar(out.par.mode, "webrtc")
        self._setPar(out.par.fps, fps)
        self._setPar(out.par.active, 1)
        # webrtc/webrtcconnection/webrtcvideotrack deliberately NOT set here —
        # they're per-peer, set a frame after negotiation by
        # webserver-callbacks.attach_streams. Setting them here would cut a
        # live peer's video on every Rebuild.

        self._wire(select, fit)
        self._wire(fit, flip)
        self._wire(flip, out)

        self._setNoteText(
            self._getOrCreateNote(select),
            self._streamText(stream_id, info, source, width, fps),
        )
        return [select, fit, flip, out]

    def _streamText(self, stream_id, info, source, width, fps):
        return "stream: %s (%s)\nsource: %s\nmax %dpx, flipx -> WebRTC track '%s' @ %d fps" % (
            stream_id,
            info.get("label", stream_id),
            source,
            width,
            stream_id,
            fps,
        )

    # ── layout ────────────────────────────────────────────────────────────────

    def _layout(self, chains, lifecycle):
        """Place the generated operators right of the hand-built ones: lifecycle
        column, then per-config watchers, then stream chains. Anchor is computed
        from whatever's already in the component, since this ships into projects
        whose layout it can't know."""
        # Annotations excluded from the anchor — a group annotation is
        # deliberately wider than what it encloses, which would push the anchor
        # off into empty space.
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

        # Every column is _NOTE_WIDTH wide regardless of its DATs' own width,
        # since a note is centred on its host.
        watchers_x = anchor_x + _NOTE_WIDTH + _GRID
        chains_x = watchers_x + _NOTE_WIDTH + _GRID

        self._layoutLifecycleOps(anchor_x, anchor_y, lifecycle)
        self._layoutWatchers(watchers_x, anchor_y)
        self._layoutChains(chains_x, anchor_y, chains)

    def _rowStep(self, ops):
        """Vertical step clearing the tallest of `ops` plus its note."""
        tallest = max(o.nodeHeight for o in ops)
        unit = tallest + _NOTE_GAP_BELOW + _NOTE_HEIGHT + _NOTE_GAP_ABOVE
        return int(math.ceil(unit / float(_GRID)) * _GRID)

    def _placeNote(self, host, x):
        """Put a generated operator's note directly above it, centred — created
        here too, so layout alone keeps everything captioned even after a
        Rebuild that only touched some entries."""
        note = self._getOrCreateNote(host)
        note.nodeX = x - (_NOTE_WIDTH - host.nodeWidth) // 2
        note.nodeY = host.nodeY + host.nodeHeight + _NOTE_GAP_BELOW
        note.nodeWidth = _NOTE_WIDTH
        note.nodeHeight = _NOTE_HEIGHT

    def _layoutLifecycleOps(self, x, top_y, lifecycle):
        """The exit/config/pre_release column, left of the per-config watchers —
        these build and tear down that column rather than watching anything in
        it, so they read as upstream of it. Order is the caller's (lifecycle
        order); any entry can be None on a name clash."""
        pinned = [o for o in lifecycle if o is not None]
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
        """One row per stream, in config order — that order is load-bearing
        elsewhere too (webrtc-callbacks zips it against the SDP's video m-lines),
        so the wall reads top to bottom the same way the browser numbers it."""
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
