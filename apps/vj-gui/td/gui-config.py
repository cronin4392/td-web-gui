"""
Config for the GUI instance — the scene-loader control surface, on port 8765.

Backing operators this project expects:
        /GUI/ExternalScenes/SceneA … SceneH   custom pars `Text`, `Text2`
        the Colors tool named by COLOR_TOOL below, and its color scheme COMPs
        the status bar's beat-period radio, named by BEAT_PERIOD_RADIO below

Loading a scene does NOT go through here: the web app calls each SceneLoader
process directly (`loadScene` in td/scene-config.py), bypassing this project's
MessageDispatcher entirely.

Which loader the web app shows is its own state, not a value read from TD — so
there's no `Selectedloader` entry here. The MIDI select button nudges it with a
fire-and-forget call the web registered, which needs nothing in this file:

        op.GUI.op('Tools/WebGuiServer').Notify(
                'selectLayer', {'layer': parent.ToxLoader.par.Scenekey.eval()}
        )

An event rather than a parameter deliberately: nothing about the selection
outlives this project, which is on its way out.

The scenes are separate processes with their own config: td/scene-config.py.
"""

CALLBACKS = "webserver1_callbacks"

# The ten external scene loaders, matching SCENE_KEYS in Tools/ExternalPorts.
# Each exposes the same pair of text pars. A tuple rather than a string: Z1 and
# Z2 are two characters, so iterating a string would split them.
SCENE_IDS = ("A", "B", "C", "D", "E", "F", "G", "H", "Z1", "Z2")
SCENE_PATH = "/GUI/ExternalScenes/Scene%s"

# The Colors tool: owner of the active-scheme par, and the COMP the color groups
# sit inside.
COLOR_TOOL = "/GUI/GUI/Main/Settings/Colors/Colors"

# The color group list behind the tabs, one row per group: name, path, nodeY.
# Its rows come from an Op Find tagged `color-group`, so tagging a COMP in TD is
# all it takes to add a tab here — and untagging one (as Dynamic is) removes it
# from the web and the TD panel together.
COLOR_GROUPS = "/GUI/GUI/Main/Settings/Colors/null_color_groups"

# The widget inside Radio1, which holds the bind's CONSTANT master. Radio1's own
# Value0 is the BIND-mode follower, and a web write to any non-CONSTANT par is
# refused — so the master is the writable end, and the bind moves Radio1 with it.
BEAT_PERIOD_RADIO = "/GUI/GUI/StatusBar/Radio1/buttonRadio"

REGISTRY = {
    # The color scheme currently driving the GUI. Its value is the scheme COMP's
    # path, which is also that scheme's id in the `colorSchemes` catalog below —
    # so the web selects one by echoing back a path the catalog gave it.
    #
    # Writable, and that write is the whole of "pick a color": everything
    # downstream (ActiveColor's parameter1 -> active_color_comp -> its three
    # select CHOPs) is expression-driven off this par. It must stay in CONSTANT
    # mode; a write to an expression- or bind-driven par is refused.
    "activeColorScheme": {
        "op": COLOR_TOOL,
        "par": "Activecolorpath",
        "type": "string",
    },
    # 0-2 selects the period rather than being it: GlobalLoader/BeatPeriod
    # switches those onto 1, 2, 4.
    "beatPeriod": {
        "op": BEAT_PERIOD_RADIO,
        "par": "Value0",
        "type": "number",
    },
}

# sceneAText1 / sceneAText2 … sceneZ2Text1 / sceneZ2Text2. The web app derives
# these same names from its scene id, so the two sides must agree on the spelling.
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

# Nothing streams from here. The scene catalog moved to SQLite
# (`server/scenes-db.ts`, built from the scene folders' meta.json), and the color
# schemes are a call rather than a readout — see `_color_schemes` below.
READOUTS = {}


# How far a sample may sit from the straight line between the stops that survived
# before it earns a stop of its own. 0.012 is about 3/255 — invisible in a
# gradient bar, and it collapses a plain two-key ramp back to the two stops it
# really is. Most schemes here come out at 3 to 6 stops.
_STOP_TOLERANCE = 0.012

# Samples examined per ramp. The CHOPs are 256-512 samples and the tolerance pass
# is quadratic in what it is handed; striding down to this first keeps the whole
# catalog under ~50ms, and still places a hard edge within 1/128 of the bar.
_STOP_BUDGET = 129


def _describes(samples, anchor, end, tolerance):
    """Does a straight line from `anchor` to `end` describe every sample between
    them, on every channel, to within `tolerance`?"""
    span = end - anchor
    for between in range(anchor + 1, end):
        weight = (between - anchor) / span
        for channel in range(4):
            start = samples[anchor][channel]
            on_line = start + (samples[end][channel] - start) * weight
            if abs(samples[between][channel] - on_line) > tolerance:
                return False
    return True


def _ramp_stops(chop):
    """A ramp CHOP as `[pos, r, g, b, a]` rows — every value 0-1, `pos` running
    0 at the left of the ramp to 1 at the right. Samples a straight line between
    the neighbouring stops already predicts are dropped, so a two-key ramp costs
    two stops and only a real inflection costs a third."""
    total = chop.numSamples
    if total < 2:
        return []

    stride = max(1, -(-total // _STOP_BUDGET))
    indexes = list(range(0, total, stride))
    if indexes[-1] != total - 1:
        indexes.append(total - 1)

    channels = {c.name: c.vals for c in chop.chans()}
    opaque = [1.0] * total
    samples = [
        [float(channels.get(name, opaque)[i]) for name in ("r", "g", "b", "a")] for i in indexes
    ]

    kept = [0]
    anchor = 0
    for i in range(1, len(samples)):
        if not _describes(samples, anchor, i, _STOP_TOLERANCE):
            kept.append(i - 1)
            anchor = i - 1
    kept.append(len(samples) - 1)

    last = total - 1
    return [[round(indexes[i] / last, 4)] + [round(v, 4) for v in samples[i]] for i in kept]


def _color_schemes(args):
    """Every color scheme the GUI can switch to, grouped for the web's tabs.

    Enumeration is TouchDesigner's own — COLOR_GROUPS for the groups, each
    group's `out1` for what is in one — so the web's list and the TD panel's
    cannot disagree; both replicators read these same two tables.

    The picture comes from each scheme's `ramp_chop`, the ramp as CHOP samples
    AFTER the flip TOPs and Gradient COMPs that sit between a source Ramp TOP
    and the scheme. It is the same CHOP ActiveColor selects when a scheme goes
    live, which is what makes a scheme's swatch and its output the same ramp.
    Reading the CHOP also keeps this off the GPU — no TOP download per scheme.
    """
    groups = []
    for group in opex(COLOR_GROUPS).rows()[1:]:
        schemes = []
        for scheme in opex(group[1].val + "/out1").rows()[1:]:
            path = scheme[1].val
            ramp = op(path + "/ramp_chop")
            # A COMP that isn't a Template clone has no ramp to draw. Skipping
            # beats failing the whole catalog over one odd entry.
            if ramp is None:
                continue
            schemes.append({"name": scheme[0].val, "path": path, "stops": _ramp_stops(ramp)})
        groups.append({"name": group[0].val, "schemes": schemes})
    return {"groups": groups}


HANDLERS = {"colorSchemes": _color_schemes}
