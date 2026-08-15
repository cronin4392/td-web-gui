"""
Config for the Input instance — the rig's MIDI and audio front end, on port 8766.

Backing operators this project expects:
        the beat CHOP named by BEAT_CHOP below, with a `bpm` channel
        the analyser CHOP named by AUDIO_CHOP below, with `low`/`mid`/`high`

Read-only: this project publishes what it detects and takes nothing back, so
REGISTRY is empty and everything rides READOUTS. The beat *period* the rig
divides that tempo by is the GUI project's, not this one's — see gui-config.py.

The GUI and scene configs are separate: gui-config.py and scene-config.py,
beside this file.
"""

CALLBACKS = "webserver1_callbacks"

# The beat detector's output, sampled by the web's BPM readout.
BEAT_CHOP = "/project1/Tools/WebGui/beat_gui"

# The band splitter behind the web's audio meter.
AUDIO_CHOP = "/project1/Audio/out_audio_analysis"

REGISTRY = {}

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
