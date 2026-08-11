"""
Config for the Input instance — the rig's MIDI and audio front end, on port 8766.

Backing operators this project expects:
        the beat CHOP named by BEAT_CHOP below, with a `bpm` channel

Read-only: this project publishes what it detects and takes nothing back, so
REGISTRY is empty and everything rides READOUTS. The beat *period* the rig
divides that tempo by is the GUI project's, not this one's — see gui-config.py.

The GUI and scene configs are separate: gui-config.py and scene-config.py,
beside this file.
"""

CALLBACKS = "webserver1_callbacks"

# The beat detector's output, sampled by the web's BPM readout.
BEAT_CHOP = "/project1/Tools/WebGui/beat_gui"

REGISTRY = {}

WEBRTC = None

STREAMS = {}

READOUTS = {
    "bpm": {
        "op": BEAT_CHOP,
        "chan": "bpm",
    },
}
