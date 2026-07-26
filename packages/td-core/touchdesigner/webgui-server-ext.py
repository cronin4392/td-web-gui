"""
WebGuiServer extension — generates the Parameter Execute DATs that carry
TD -> web changes.

One Parameter Execute DAT per operator the config's REGISTRY references, each
watching exactly that operator's registered parameters. Everything is derived
from the config, so adding a registry entry is the whole of the work: no DAT to
create, no `OPs` string to keep in sync by hand.

Nothing here is project specific — drop this into any project unchanged, like
the other three scripts. It reads the same config the callbacks read, through
the same `op.WebGuiServer` global shortcut.

Set on the WebGuiServer component:
	Tdcoredir     Folder par pointing at this directory. parameter-execute.py is
	              resolved inside it, and every generated DAT syncs its text from
	              there — so a hot-reload of that file reaches all of them at
	              once. The same par already locates the callbacks scripts.

Why one DAT per operator rather than one watching everything: a Parameter
Execute DAT's `OPs` and `Parameters` fields are a cross product, so a single DAT
covering N operators watches every registered parameter NAME on every one of
them. Custom names rarely collide across operators, but built-in ones (`file`,
`index`, `device`) collide constantly, and the `Built-In` toggle is per-DAT.
Splitting per operator makes each watch an exact set of (operator, parameters)
pairs and scopes `Built-In` to the operators that actually need it.

	Correctness does not depend on any of that — webserver-callbacks.py's
	broadcast_param_change re-checks owner and parameter name against the
	registry before broadcasting, so an over-broad watch was only ever wasted
	work. This is about cost, and about the watch being legible.
"""

import math

# The File expression every generated DAT gets, matching how the hand-placed
# callbacks DATs resolve their own sources. Resolved inside the component's
# Tdcoredir rather than configured separately: the component already knows where
# the td-core scripts live, and a second par holding a path into the same folder
# is one more thing to get out of step.
#
# An expression rather than a baked absolute path, so repointing Tdcoredir — on
# another machine, or a moved checkout — moves every generated DAT at once
# instead of waiting for the next Rebuild to notice.
_PAREXEC_FILE_EXPR = "op.WebGuiServer.par.Tdcoredir.eval() + '/parameter-execute.py'"

# Marks a DAT as created and owned by this extension. Reconciliation only ever
# deletes operators carrying this tag — a generated component that deletes by
# name pattern alone eventually eats something a human made.
GENERATED_TAG = 'webgui-generated'

# Shown on each generated DAT, since the thing a reader most needs to know about
# an operator they didn't create is that editing it is pointless.
GENERATED_COMMENT = ('Generated from the config REGISTRY by WebGuiServerExt. '
					 'Edits are overwritten on the next Rebuild.')

_NAME_PREFIX = 'parexec_'

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
		run('args[0].Rebuild()', self, delayFrames=5)

	def onDestroyTD(self):
		"""Nothing to tear down.

		The extension holds no timers, threads, or callback registrations, and
		the generated DATs are meant to outlive a reinit — tearing them down here
		would delete the bridge every time this file is edited.
		"""
		pass

	# ── public ────────────────────────────────────────────────────────────────

	def Rebuild(self):
		"""Make the generated Parameter Execute DATs match the config's REGISTRY.

		Idempotent and diff-based: it compares what the registry asks for against
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

		for path in sorted(desired):
			dat = keep.get(path)
			if dat is None:
				dat = self._createWatcher(path)
			self._applyWatch(dat, path, desired[path])

		self._layout()

	# ── config ────────────────────────────────────────────────────────────────

	def _config(self):
		dat = self.ownerComp.op('config')
		if dat is None:
			debug("WebGuiServerExt: no 'config' DAT - check the Config File par")
			return None
		return dat.module

	def _callbacks(self):
		"""The Web Server DAT's callbacks module.

		Reached for its par_names(), so that "which parameters back this registry
		entry" has exactly one implementation. A `number[]` entry names a
		ParGroup, not a parameter — see _desiredWatches — and a second copy of
		that expansion here is precisely how the two would drift apart.
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
		if entry['type'] == 'number[]':
			return [entry['par'] + '*']
		return [entry['par']]

	def _desiredWatches(self):
		"""What the registry asks for: op path -> {pars, custom, builtin}.

		Returns None when the config can't be read, so the caller can leave the
		network alone rather than reconcile against an empty registry and delete
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
			if entry['type'] == 'pulse':
				continue

			watch = watches.setdefault(entry['op'],
									   {'pars': [], 'custom': False, 'builtin': False})
			for name in self._parNames(entry):
				if name not in watch['pars']:
					watch['pars'].append(name)
				if self._inferParKindFromCasing(name):
					watch['custom'] = True
				else:
					watch['builtin'] = True

		return watches

	# ── reconciliation ────────────────────────────────────────────────────────

	def _generatedDats(self):
		return [c for c in self.ownerComp.children if GENERATED_TAG in c.tags]

	def _matchExisting(self, desired):
		"""Split the generated DATs into ones to keep and ones to destroy.

		Matched on the operator each DAT actually watches, read back off its OPs
		parameter, rather than on its name. A DAT someone renamed is still doing
		its job, and rebuilding it would be churn for nothing.
		"""
		keep = {}
		orphans = []
		for dat in self._generatedDats():
			# Anything carrying our tag that isn't a Parameter Execute DAT has no
			# OPs par to read. Treat it as an orphan rather than raising: it can
			# only be a leftover from an earlier shape of this component, or
			# something that got tagged by hand.
			# .val, not .eval(): OPs is an OP-style parameter, so eval() resolves
			# it to a list of operators rather than returning the path that was
			# configured. We are matching on what the DAT is set to watch.
			par = getattr(dat.par, 'op', None)
			path = par.val.strip() if par is not None else ''
			if path in desired and path not in keep:
				keep[path] = dat
			else:
				# Either the registry no longer references this operator, or a
				# second DAT ended up watching one that's already covered.
				orphans.append(dat)
		return keep, orphans

	def _datName(self, path):
		"""A legal, collision-free DAT name derived from the watched op path.

		Deriving from the full path rather than the operator's own name means two
		operators called 'params' in different networks can't land on the same
		name, so there is no collision case to resolve.
		"""
		return tdu.validName(_NAME_PREFIX + path.strip('/').replace('/', '_'))

	def _createWatcher(self, path):
		dat = self.ownerComp.create(parameterexecuteDAT, self._datName(path))
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

	def _applyWatch(self, dat, path, watch):
		self._setPar(dat.par.op, path)
		self._setPar(dat.par.pars, ' '.join(watch['pars']))
		self._setPar(dat.par.custom, int(watch['custom']))
		self._setPar(dat.par.builtin, int(watch['builtin']))

		# Value Change is the only callback parameter-execute.py implements.
		self._setPar(dat.par.valuechange, 1)
		self._setPar(dat.par.active, 1)

		self._setExpr(dat.par.file, _PAREXEC_FILE_EXPR)
		# Sync to File rather than a one-shot load, so editing parameter-execute.py
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
		par = getattr(self.ownerComp.par, 'Tdcoredir', None)
		if par is None or not par.eval().strip():
			debug('WebGuiServerExt: Tdcoredir is unset - generated DATs cannot '
				  'resolve parameter-execute.py, so TD -> web changes will not '
				  'broadcast')

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
		others = [c for c in self.ownerComp.children
				  if GENERATED_TAG not in c.tags and c.type != 'annotate']
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
