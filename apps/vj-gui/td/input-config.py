"""
Config for the Input instance — the rig's MIDI and audio front end, on port 8766.

Backing operators this project expects:
        the beat CHOP named by BEAT_CHOP below, with a `bpm` channel
        the analyser CHOP named by AUDIO_CHOP below, with `low`/`mid`/`high`
        the COMP named by GUI_STATE below, with a `Selectedloader` string par
        the COMP named by BEAT below, with a `Periodindex` int par
        the COMP named by SET_TEMPO below, with `BpmDouble()` / `BpmHalf()`

Mostly read-only: what this project detects rides READOUTS, and the two REGISTRY
entries go the other way — the selected loader, which the web and this
project's MIDI select buttons both write, and the beat period, which this
project sends on to every scene loader. HANDLERS double and halve the tempo; the
new tempo comes back on the `bpm` readout rather than in the call's result.

The MIDI store/recall buttons notify the web (`copyLayer` / `pasteLayer`, from
Midi/chopexec_clipboard), which owns the clipboard because it owns the layers'
text overrides.

The GUI and scene configs are separate: gui-config.py and scene-config.py,
beside this file.
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


HANDLERS = {"bpmDouble": _bpm_double, "bpmHalf": _bpm_half}
