"""
Config for ALL TEN scene instances — sceneA (4007), sceneB (5007), sceneC
(6007), sceneD (7007), sceneE (9007), sceneF (10007), sceneG (11007), sceneH
(12007), sceneZ1 (13007), sceneZ2 (13107). The 8000 block is skipped; the GUI
project owns it (8765), and the Z layers take half-blocks off 13000.

One file for ten TouchDesigner processes. The scene projects are the same
project, so their registry, readouts, and streams are identical and there is
nothing to keep in sync: point every WebGuiServer component's `Config File` par
at this file. Each process loads its own copy into its own `config` Text DAT and
only ever reads it, so sharing the file on disk is safe.

What differs between them lives on WebGuiServer's own parameters, not in
here: `Identifier` (sceneA … sceneZ2 — the id the web app matches) and `Port`.

That is also why no name below is scene-prefixed. A wire name is scoped to its
instance, so every process publishes a plain `level` and a plain `performance`,
and the web keeps them apart by which `<Provider>` reads them — see
`LoaderParams` in apps/vj-gui/src/playback/wire.ts, the TypeScript half of this
contract. Prefixing would only re-encode, in two places, what the connection
already says.

The GUI project's config is separate: gui-config.py, beside this file.
"""

CALLBACKS = "webserver1_callbacks"

LOADER = "/Scene1/Loader"

# `activeScene` is read-only because loading a scene is behaviour, not state, so
# it goes through HANDLERS at the bottom of this file instead.
#
# It is still a REGISTRY entry rather than a READOUT, on purpose. It rides the
# Parameter Execute path, whose onValueChange fires when the par changes "in
# any way" — an event. A READOUT pointed at the Loader's touchout2 rode the DAT
# Execute path instead, which only reports a change *between cooks* of the DAT
# it watches; touchout2 is derived from an Evaluate DAT reading dependable
# extension properties, and TD is pull-based, so with nothing demanding it the
# table never cooked and the change was never seen. Watching the par directly
# removes the demand question entirely.
REGISTRY = {
    "activeScene": {
        "op": LOADER,
        "par": "Scene",
        "type": "string",
        "writable": False,
    },
    # Here rather than in READOUTS, which reads CHOP channels and DAT cells
    # only and ignores 'par' entirely. Both are Menu pars, so 'string' carries
    # the menu *key*.
    #
    # Both must stay in CONSTANT mode to be web-writable — a write to an
    # expression- or export-driven par is refused (param_not_writable), so
    # re-attaching an expression here silently turns the web control read-only.
    "layout": {
        "op": "/Scene1/Post/Layout",
        "par": "Layout",
        "type": "string",
    },
    "color": {
        "op": "/Scene1/Post/Color",
        "par": "Color",
        "type": "string",
    },
}

WEBRTC = "webrtc1"

# `source` names the TOP to stream; the encoder is generated inside each scene's
# WebGuiServer from this entry. It is the only encoder in the project — a
# hand-placed Video Stream Out beside it would be a second one on the same TOP.
STREAMS = {
    "scene": {"source": "/Scene1/out1", "label": "Main"},
}

READOUTS = {
    "performance": {
        "op": "/Scene1/Tools/Performance/CookTimes/cook_times_dat",
        "type": "string[][]",
    },
    "level": {
        "op": "/Scene1/Inputs/null_params",
        "chan": "level",
    },
}


# No layout/color handler on purpose: they are state, so they ride the REGISTRY
# above as ordinary params. Only the load itself is behaviour.
def _load_scene(args):
    path = str((args or {}).get("path", ""))
    if not path:
        raise ValueError("loadScene needs a tox path")
    # Forward slashes only: LoadScene splits on '/' to derive folder and name.
    opex(LOADER).LoadScene(path)
    return {"ok": True}


def _clear_scene(args):
    opex(LOADER).ClearScene()
    return {"ok": True}


HANDLERS = {"loadScene": _load_scene, "clearScene": _clear_scene}
