"""
Config for the GUI instance — the scene-loader control surface, on port 8765.

Backing operators this project expects:
        /GUI/ExternalScenes/SceneA … SceneH   custom pars `Text`, `Text2`
        the Ramp TOP named by RAMP below, plus the DAT its `dat` par names

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

# The GUI's color ramp: the Ramp TOP, and the DAT its `dat` par names — one row
# per keyframe, columns pos/r/g/b/a, all 0-1.
#
# Two constants, because the web mirrors a Ramp TOP as its keyframe table PLUS
# its parameters, and those are two different kinds of entry below. Both are
# spelled out rather than one derived from the other: `_keys` is only what TD
# happens to name the DAT it creates alongside a Ramp TOP, and the `dat` par can
# be repointed at any DAT anywhere. Repoint both together if the ramp moves —
# READOUTS reads an operator by path, and following the par instead would mean
# an `op()` call at module level, which runs during import before the network is
# guaranteed to be there.
_COLORS = "/GUI/GUI/Main/Settings/Colors/Colors/Colors"
RAMP = _COLORS + "/blue_purp_red"
RAMP_KEYS = _COLORS + "/blue_purp_red_keys"

REGISTRY = {}

# The Ramp TOP's own geometry, beside its keyframe table in READOUTS below.
# Lowercase par names: these are built-in pars, not custom ones.
#
# All four are writable:False because the GUI mirrors the ramp rather than
# authoring it. That is the TD-side backstop; the web declares the same names in
# `guiReadonly`. Dropping the flag is all it takes to make one drivable from the
# web, since every one of them is an ordinary CONSTANT par.
for _ramp_name, _ramp_par, _ramp_type in (
    ("rampType", "type", "string"),
    ("rampInterp", "interp", "string"),
    ("rampPhase", "phase", "number"),
    ("rampPeriod", "period", "number"),
):
    REGISTRY[_ramp_name] = {
        "op": RAMP,
        "par": _ramp_par,
        "type": _ramp_type,
        "writable": False,
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

# The scene catalog moved to SQLite (`server/scenes-db.ts`, built from the scene
# folders' meta.json), so the GUI no longer publishes it.
READOUTS = {
    # The ramp's keyframes. Pointed at the DAT itself rather than at the Ramp
    # TOP, so the generated DAT Execute watcher sees a keyframe edit — dragging
    # a color tab on the ramp bar writes this table.
    "rampKeys": {
        "op": RAMP_KEYS,
        "type": "string[][]",
    },
}
