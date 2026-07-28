"""
Config for BOTH scene instances — sceneA (port 4007) and sceneB (port 5007).

One file for two TouchDesigner processes. The scene projects are the same
project, so their registry, readouts, and streams are identical and there is
nothing to keep in sync: point both WebGuiServer components' `Config File` par
at this file. Each process loads its own copy into its own `config` Text DAT and
only ever reads it, so sharing the file on disk is safe.

What differs between the two lives on WebGuiServer's own parameters, not in
here: `Identifier` (sceneA / sceneB — the id the web app matches) and `Port`.

That is also why no name below is scene-prefixed. A wire name is scoped to its
instance, so both processes publish a plain `level` and a plain `cpuCookTime`,
and the web keeps them apart by which `<Provider>` reads them — see
`SceneParams` in apps/vj-gui/src/td.config.ts, the TypeScript half of this
contract. Prefixing would only re-encode, in two places, what the connection
already says.

The GUI project's config is separate: td/config.py at the repo root.
"""

CALLBACKS = "webserver1_callbacks"

# Nothing on a scene is web-writable as a *parameter* — the writable params still
# live on the GUI project. Loading a scene is behaviour, not state, so it goes
# through HANDLERS at the bottom of this file instead.
REGISTRY = {}

WEBRTC = "webrtc1"

# `source` names the TOP to stream; the encoder is generated inside each scene's
# WebGuiServer from this entry.
#
# Repoint this at the TOP feeding `videostreamout1` and delete that TOP — it is a
# redundant encoder now, and only passes its input through.
STREAMS = {
    "scene": {"source": "/Scene1/out1", "label": "Main"},
}

READOUTS = {
    "cpuCookTime": {
        "op": "/Scene1/Tools/Performance/CookTimes/out1",
        "chan": "cpuCookTime",
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

LOADER = "/Scene1/Loader"


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
