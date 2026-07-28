"""
Config for the GUI instance — the scene-loader control surface, on port 8765.

Backing operators this project expects:
        /GUI/ExternalScenes/SceneA … SceneH   custom pars `Text`, `Text2`

Loading a scene does NOT go through here: the web app calls each SceneLoader
process directly (`loadScene` in td/scene-config.py), bypassing this project's
MessageDispatcher entirely.

Which loader's text pair the web app shows is local UI state (`selectedLayer`
in apps/vj-gui/src/App.tsx, set by clicking a video tile in LayerPreviews),
not a value read from TD — so there's no `Selectedloader` entry here.

The scenes are separate processes with their own config: td/scene-config.py.
"""

CALLBACKS = "webserver1_callbacks"

# The eight external scene loaders. Each exposes the same pair of text pars.
SCENE_IDS = "ABCDEFGH"
SCENE_PATH = "/GUI/ExternalScenes/Scene%s"

REGISTRY = {}


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

# The scene catalog moved to SQLite (`server/scenes-db.ts`, built from the scene
# folders' meta.json), so the GUI no longer publishes it.
READOUTS = {}
