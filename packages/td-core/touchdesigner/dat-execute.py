"""
DAT Execute DAT — TD -> web bridge for DAT-backed readouts.

Watches the DATs named by the config's READOUTS and tells the Web Server DAT's
callbacks module that one changed. Covers both readout shapes a DAT can back: a
single cell (`row`/`col`) and a whole table (`type: 'string[][]'`). Readouts are
one-way: nothing here ever writes to a DAT, and a web `update` aimed at a readout
name is refused by webserver-callbacks with `param_not_writable`.

Nothing here is project specific — drop this into any project unchanged. The
name of the callbacks DAT comes from CALLBACKS in the config DAT, which the
WebGuiServer component loads from its Config File par; see config-template.py.

You do not load this file into a DAT by hand, and you do not configure one.
WebGuiServerExt generates one DAT Execute DAT per DAT the READOUTS map
references and sets each one's DAT, Table Change, and Execute from it. It is
resolved inside the component's Td Core Dir par, and the generated DATs sync
their text from it — so editing this file hot-reloads all of them at once.

Deliberately implemented here: only onTableChange. As of 2025.30000 it "does
everything now" and the other four (onRowChange, onColChange, onCellChange,
onSizeChange) are deprecated, so the generated DATs enable Table Change alone.
They are kept below as no-ops purely so that toggling one on by hand in a live
project raises nothing.

The generated DATs also set **Execute = End of Frame**, which is the DAT Execute
DAT's own coalescer: it calls this "at most one time per frame, at the end of the
frame, even if it triggered several times in one frame". CHOP-backed readouts
have no equivalent parameter, which is why the coalescing for those lives in
webserver-callbacks.flush_readouts instead — and why this file marks rather than
sends, so both paths share the one end-of-frame `update`.
"""


def _webgui():
	"""The WebGuiServer component, via its global OP shortcut.

	A shortcut rather than a path, so this file resolves it wherever it's dropped.
	"""
	comp = getattr(op, 'WebGuiServer', None)
	if comp is None:
		raise RuntimeError("dat-execute: no global OP shortcut 'WebGuiServer' - "
						   "set one on the component holding the config DAT")
	return comp


def _config():
	dat = _webgui().op('config')
	if dat is None:
		raise RuntimeError("dat-execute: WebGuiServer has no 'config' DAT - "
						   "check its Config File parameter")
	return dat.module


def _callbacks():
	# Resolved from inside WebGuiServer, not from beside this DAT: the callbacks
	# DAT lives in the component, while this DAT lives wherever the DATs it
	# watches are. webserver-callbacks.py resolves CALLBACKS the same way, so a
	# bare name means the same thing in both scripts.
	name = _config().CALLBACKS
	dat = _webgui().op(name)
	if dat is None:
		# Raise rather than return None. A missing callbacks DAT means every
		# readout change is dropped on the floor, which would otherwise be
		# indistinguishable from a table that simply never changes.
		raise RuntimeError("dat-execute: WebGuiServer has no DAT '%s' - "
						   "check CALLBACKS in the config DAT" % name)
	return dat.module


def onTableChange(dat, prevDAT, info):
	# `info` (rowsChanged, cellsChanged, ...) is deliberately not consulted. The
	# flush re-reads whatever this DAT backs, and narrowing to the changed cells
	# would only add a second way to decide what a readout covers — the shape
	# rules in webserver-callbacks already own that.
	_callbacks().broadcast_table_change(dat)
	return


# Deprecated as of 2025.30000 — onTableChange covers all four. Left as no-ops so
# that enabling one by hand on a generated DAT does nothing rather than raising.

def onRowChange(dat, rows):
	return


def onColChange(dat, cols):
	return


def onCellChange(dat, cells, prev):
	return


def onSizeChange(dat):
	return
