"""
Config for the Input instance — the rig's MIDI and audio front end, on port 8766.

Backing operators this project expects:
        the beat CHOP named by BEAT_CHOP below, with a `bpm` channel
        the analyser CHOP named by AUDIO_CHOP below, with `low`/`mid`/`high`
        the COMP named by GUI_STATE below, with a `Selectedloader` string par
        the COMP named by BEAT below, with a `Periodindex` int par
        the COMP named by SET_TEMPO below, with `BpmDouble()` / `BpmHalf()`
        the Colors tool named by COLOR_TOOL below, and its color scheme COMPs

Mostly read-only: what this project detects rides READOUTS, and the REGISTRY
entries go the other way — the selected loader, which the web and this
project's MIDI select buttons both write; the beat period, which this project
sends on to every scene loader; and the active color scheme, which the Colors
tool publishes to every scene loader over shared memory. HANDLERS double and
halve the tempo (the new tempo comes back on the `bpm` readout rather than in
the call's result) and list the color schemes.

The MIDI store/recall buttons notify the web (`copyLayer` / `pasteLayer`, from
Midi/chopexec_clipboard), which owns the clipboard because it owns the layers'
text overrides.

The scene config is separate: scene-config.py, beside this file.
"""

CALLBACKS = "webserver1_callbacks"

# The beat detector's output, sampled by the web's BPM readout.
BEAT_CHOP = "/project1/Tools/WebGui/beat_gui"

# The band splitter behind the web's audio meter.
AUDIO_CHOP = "/project1/Audio/out_audio_analysis"

# Holder of the web's selected loader. Nothing in this project drives it — it is
# a place to keep a web value where TD Python can reach it.
GUI_STATE = "/project1/GuiState"

# Its Touch Out on BeatPeriodPort (8006) is what every scene loader reads.
BEAT = "/project1/Beat"

SET_TEMPO = "/project1/SetTempo"

# The Colors tool: owner of the active-scheme par, and the COMP the color groups
# sit inside. Its `out1` lists the groups — an Op Find tagged `color-group`, so
# tagging a COMP in TD is all it takes to add a tab on the web.
COLOR_TOOL = "/project1/Colors"

REGISTRY = {
    # The selected layer, as its loader key ("A"-"H", "Z1"-"Z6"). Written by the
    # web and by Midi/chopexec_layer_select.
    #
    # It lives here rather than in the web alone because a browser signal is
    # unreachable from TouchDesigner. Must stay in CONSTANT mode; a write to an
    # expression- or bind-driven par is refused.
    "selectedLoader": {"op": GUI_STATE, "par": "Selectedloader", "type": "string"},
    # 0-2 selects the period rather than being it: Beat/constant_period maps it
    # onto 1, 2, 4 beats. Must stay in CONSTANT mode, like selectedLoader.
    "beatPeriod": {"op": BEAT, "par": "Periodindex", "type": "number"},
    # The active color scheme, as the scheme COMP's path relative to COLOR_TOOL
    # ("Colors/RedBlue") — also that scheme's id in the `colorSchemes` catalog.
    # Writing it is the whole of picking a color: ActiveColor's selects resolve
    # it through `parent.Tool`. Must stay in CONSTANT mode, like selectedLoader.
    "activeColorScheme": {"op": COLOR_TOOL, "par": "Activecolorpath", "type": "string"},
}

WEBRTC = None

STREAMS = {}

READOUTS = {
    "bpm": {
        "op": BEAT_CHOP,
        "chan": "bpm",
    },
    # One entry rather than three: the bands are one measurement, and a channel
    # list rides the wire as a `number[]` in the order listed here. That order
    # is the whole contract — nothing on the wire names the bands — so it is
    # repeated once on the web side, as AUDIO_BANDS in wire.ts.
    "audio": {
        "op": AUDIO_CHOP,
        "chan": ["low", "mid", "high"],
    },
}


def _bpm_double(args):
    opex(SET_TEMPO).BpmDouble()
    return {"ok": True}


def _bpm_half(args):
    opex(SET_TEMPO).BpmHalf()
    return {"ok": True}


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
    """Every color scheme the Colors tool can switch to, grouped for the web's
    tabs.

    Enumeration is TouchDesigner's own — the tool's `out1` for the groups, each
    group's `out1` for what is in one — so tagging or untagging a group in TD is
    all it takes to change the web's list.

    The picture comes from each scheme's `ramp_chop`, the ramp as CHOP samples
    AFTER the flip TOPs and Gradient COMPs that sit between a source Ramp TOP
    and the scheme. It is the same CHOP ActiveColor selects when a scheme goes
    live, which is what makes a scheme's swatch and its output the same ramp.
    Reading the CHOP also keeps this off the GPU — no TOP download per scheme.
    """
    tool = opex(COLOR_TOOL)
    groups = []
    for group in tool.op("out1").rows()[1:]:
        schemes = []
        for scheme in opex(group[1].val + "/out1").rows()[1:]:
            comp = op(scheme[1].val)
            ramp = comp.op("ramp_chop") if comp else None
            # A COMP that isn't a Template clone has no ramp to draw. Skipping
            # beats failing the whole catalog over one odd entry.
            if ramp is None:
                continue
            schemes.append(
                {
                    "name": scheme[0].val,
                    "path": tool.relativePath(comp).removeprefix("./"),
                    "stops": _ramp_stops(ramp),
                }
            )
        groups.append({"name": group[0].val, "schemes": schemes})
    return {"groups": groups}


HANDLERS = {"bpmDouble": _bpm_double, "bpmHalf": _bpm_half, "colorSchemes": _color_schemes}
