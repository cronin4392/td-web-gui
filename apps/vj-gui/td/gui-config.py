"""
Config for the GUI instance — the scene-loader control surface, on port 9980.

Backing operators this project expects:
        /GUI/GUI                              custom par `Selectedloader`
        /GUI/ExternalScenes/SceneA … SceneH   custom pars `Text`, `Text2`

The web app shows only the text pair belonging to whichever loader
`selectedLoader` points at — see `VjGuiParams` and `sceneIdFromLoaderPath` in
apps/vj-gui/src/td.config.ts, which parses the loader's PATH, so the
SCENE_PATH below and that file's LOADER_PATH_PREFIX have to agree.

`Selectedloader` is an OP-reference par: it eval()s to the operator rather than
a string, and webserver-callbacks._to_string sends its `.path`. An empty one
eval()s to None and is skipped from the snapshot with a warning, which the web
reads as "no loader selected yet".

The scenes are separate processes with their own config: td/scene-config.py.
"""

CALLBACKS = "webserver1_callbacks"

# The eight external scene loaders. Each exposes the same pair of text pars.
SCENE_IDS = "ABCDEFGH"
SCENE_PATH = "/GUI/ExternalScenes/Scene%s"

REGISTRY = {
    "selectedLoader": {
        "op": "/GUI/GUI",
        "par": "Selectedloader",
        "type": "string",
    }
}


# sceneAText1 / sceneAText2 … sceneHText1 / sceneHText2. The web app derives these
# same names from its scene id, so the two sides must agree on the spelling.
for _scene in SCENE_IDS:
    REGISTRY["scene%sText1" % _scene] = {"op": SCENE_PATH % _scene, "par": "Text", "type": "string"}
    REGISTRY["scene%sText2" % _scene] = {
        "op": SCENE_PATH % _scene,
        "par": "Text2",
        "type": "string",
    }

# Params only — the video comes from the scene instances, not from here. The web
# side matches: App.tsx passes `video` to the scene providers, not the GUI one.
WEBRTC = None

STREAMS = {}

READOUTS = {}
