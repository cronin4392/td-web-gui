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

# Nothing on a scene is web-writable yet — they are read-only monitors, and the
# writable params still live on the GUI project.
REGISTRY = {}

WEBRTC = "webrtc1"

STREAMS = {
    "scene": {"top": "/Scene1/videostreamout1", "label": "Main"},
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
