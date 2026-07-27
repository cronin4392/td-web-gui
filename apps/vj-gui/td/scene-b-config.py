CALLBACKS = "webserver1_callbacks"

REGISTRY = {}

WEBRTC = "webrtc1"

STREAMS = {
    "scene": {"top": "/Scene1/videostreamout1", "label": "Main"},
}

READOUTS = {
    "sceneBCpuCookTime": {
        "op": "/Scene1/Tools/Performance/CookTimes/out1",
        "chan": "cpuCookTime",
    },
    "sceneBPerformance": {
        "op": "/Scene1/Tools/Performance/CookTimes/cook_times_dat",
        "type": "string[][]",
    },
    "sceneBLevel": {
        "op": "/Scene1/Inputs/null_params",
        "chan": "level",
    },
}
