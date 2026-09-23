"""
Config for the Input instance — the rig's MIDI and audio front end, on port 8766.

Backing operators this project expects:
        the beat CHOP named by BEAT_CHOP below, with a `bpm` channel
        the analyser CHOP named by AUDIO_CHOP below, with `low`/`mid`/`high`
        the COMP named by GUI_STATE below, with a `Selectedloader` string par

Almost read-only: what this project detects rides READOUTS, and the one REGISTRY
entry goes the other way — the web's selected loader, parked here so this
project's MIDI scripts can read it. The beat *period* the rig divides that tempo
by is the GUI project's, not this one's — see gui-config.py.

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

REGISTRY = {
    # Which layer the web has selected, as its loader key ("A"-"H", "Z1"-"Z4") —
    # the same `Scenekey` the GUI project's select button reports.
    #
    # It lives here rather than in the web alone because a browser signal is
    # unreachable from TouchDesigner, and it lives in THIS project rather than
    # the GUI's because this is the one that needs to read it. Must stay in
    # CONSTANT mode; a write to an expression- or bind-driven par is refused.
    "selectedLoader": {"op": GUI_STATE, "par": "Selectedloader", "type": "string"},
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
