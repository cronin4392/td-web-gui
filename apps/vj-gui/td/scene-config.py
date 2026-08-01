"""
Config for ALL EIGHT scene instances — sceneA (4007), sceneB (5007), sceneC
(6007), sceneD (7007), sceneE (9007), sceneF (10007), sceneG (11007), sceneH
(12007). The 8000 block is skipped; the GUI project owns it (8765).

One file for eight TouchDesigner processes. The scene projects are the same
project, so their registry, readouts, and streams are identical and there is
nothing to keep in sync: point every WebGuiServer component's `Config File` par
at this file. Each process loads its own copy into its own `config` Text DAT and
only ever reads it, so sharing the file on disk is safe.

What differs between them lives on WebGuiServer's own parameters, not in
here: `Identifier` (sceneA … sceneH — the id the web app matches) and `Port`.

That is also why no name below is scene-prefixed. A wire name is scoped to its
instance, so every process publishes a plain `level` and a plain `cpuCookTime`,
and the web keeps them apart by which `<Provider>` reads them — see
`LoaderParams` in apps/vj-gui/src/playback/wire.ts, the TypeScript half of this
contract. Prefixing would only re-encode, in two places, what the connection
already says.

The GUI project's config is separate: gui-config.py, beside this file.
"""

CALLBACKS = "webserver1_callbacks"

LOADER = "/Scene1/Loader"

# Nothing here is web-*writable* — the writable params still live on the GUI
# project, and loading a scene is behaviour, not state, so it goes through
# HANDLERS at the bottom of this file instead.
#
# `activeScene` is a REGISTRY entry rather than a READOUT on purpose. It rides
# the Parameter Execute path, whose onValueChange fires when the par changes "in
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
}

WEBRTC = "webrtc1"

# `source` names the TOP to stream; the encoder is generated inside each scene's
# WebGuiServer from this entry. It is the only encoder in the project — a
# hand-placed Video Stream Out beside it would be a second one on the same TOP.
STREAMS = {
    "scene": {"source": "/Scene1/out1", "label": "Main"},
}

READOUTS = {
    "cpuCookTime": {
        "op": "/Scene1/Tools/Performance/CookTimes/out1",
        "chan": "cpuCookTime",
    },
    "gpuCookTime": {
        "op": "/Scene1/Tools/Performance/CookTimes/out1",
        "chan": "gpuCookTime",
    },
    "performance": {
        "op": "/Scene1/Tools/Performance/CookTimes/cook_times_dat",
        "type": "string[][]",
    },
    "level": {
        "op": "/Scene1/Inputs/null_params",
        "chan": "level",
    },
}


# Layout/color are absent on purpose: the GUI still owns them and pushes them in
# over Touch In/Out, so there is no par here to set. See TODO.md #3.
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
