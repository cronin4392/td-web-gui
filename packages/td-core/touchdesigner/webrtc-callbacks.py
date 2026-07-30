"""
webrtcDAT callbacks — TD Web GUI video signaling.

The WebRTC DAT owns the peer connection and the media; this file does nothing
but relay its signaling to the right browser over the *same* WebSocket the
control data already uses. Inbound signaling travels the other way — the Web
Server DAT receives it and drives the WebRTC DAT — so the two files split like
this:

        webserver-callbacks.py   browser -> TD   (rtc-offer / rtc-answer / rtc-ice in)
        webrtc-callbacks.py      TD -> browser   (rtc-offer / rtc-answer / rtc-ice /
                                                  streams out)

Nothing here is project specific — drop this into any project unchanged. The
stream map comes from the config DAT the WebGuiServer component loads; see
config-template.py.

Offer role: the **browser** offers, on first connect and on every rebuild,
using recvonly transceivers — so onAnswer carries the normal path, and onOffer
only fires when TD itself renegotiates (a track added/removed at runtime),
which onNegotiationNeeded kicks off.

Set by hand on the WebRTC DAT: Callbacks DAT = this DAT, ICE Servers = empty
(browser and TD share a machine, so host candidates are all that's needed).

The Video Stream Out TOPs are not among them — WebGuiServerExt generates one
per STREAMS entry, and webserver-callbacks points it at the negotiated peer.

See docs/protocol.md for the message catalog.
"""

from typing import Any


def _webgui():
    """The WebGuiServer component, via its parent shortcut."""
    comp = getattr(parent, "WebGuiServer", None)
    if comp is None:
        raise RuntimeError(
            "webrtc-callbacks: no parent OP shortcut 'WebGuiServer' found above this DAT - "
            "set Parent Shortcut on the WebGuiServer component"
        )
    return comp


def _config():
    dat = _webgui().op("config")
    if dat is None:
        raise RuntimeError(
            "webrtc-callbacks: WebGuiServer has no 'config' DAT - check its Config File parameter"
        )
    return dat.module


def _server_callbacks():
    """The Web Server DAT's callbacks module — owns the client sockets. None
    when that DAT isn't in the project yet, so early signaling is dropped
    rather than raising inside the WebRTC DAT."""
    dat = op(_config().CALLBACKS)
    return dat.module if dat is not None else None


def _streams():
    """The project's stream map: wire id -> {'source': ..., 'label': ...}."""
    return getattr(_config(), "STREAMS", {})


def _relay(connectionId, message):
    """Send one signaling message to the browser that owns this connection."""
    cb = _server_callbacks()
    if cb is not None:
        cb.send_signaling(connectionId, message)


def _video_mids(sdp):
    """The `mid` of each video m-section in `sdp`, in SDP order. Read back
    from the local description rather than assumed, since a renegotiation can
    shift which mid the browser assigns."""
    mids = []
    in_video = False
    for line in sdp.splitlines():
        line = line.strip()
        if line.startswith("m="):
            in_video = line[2:].split()[0] == "video"
        elif in_video and line.startswith("a=mid:"):
            mids.append(line[len("a=mid:") :].strip())
            in_video = False  # one mid per m-section
    return mids


def _announce_streams(connectionId, sdp):
    """Tell the browser which mid carries which stream, after every
    negotiation (not just the first — a renegotiation can shift mids).
    Streams are paired with video m-lines in order, since TD fills the
    offered m-lines in order."""
    streams = _streams()
    if not streams:
        return

    mids = _video_mids(sdp)
    if len(mids) < len(streams):
        # A recvonly answerer can't add m-lines, so surplus streams have
        # nowhere to go until the web side raises `receivers`.
        print(
            "webrtc-callbacks: warning - %d stream(s) configured but the SDP "
            "carries %d video m-line(s); raise `receivers` on the web-side "
            "<Provider video={{ receivers: N }}> to carry them all" % (len(streams), len(mids))
        )

    _relay(
        connectionId,
        {
            "type": "streams",
            "streams": [
                {"id": stream_id, "mid": mid, "label": info.get("label", stream_id)}
                for (stream_id, info), mid in zip(streams.items(), mids)
            ],
        },
    )


def _send_description(connectionId, kind, localSdp):
    """Relay a local offer/answer, then re-announce the stream map."""
    _relay(connectionId, {"type": "rtc-%s" % kind, "sdp": localSdp})
    # A single socket delivers FIFO, so sending the description first is
    # enough to guarantee the map isn't applied before what it describes.
    _announce_streams(connectionId, localSdp)


def _send_ice(connectionId, candidate, lineIndex, sdpMid):
    """Relay one trickled candidate, or end-of-candidates (falsy candidate)."""
    if not candidate:
        _relay(connectionId, {"type": "rtc-ice", "candidate": None})
        return
    _relay(
        connectionId,
        {
            "type": "rtc-ice",
            "candidate": candidate,
            "sdpMid": sdpMid,
            "sdpMLineIndex": lineIndex,
        },
    )


def onOffer(webrtcDAT: webrtcDAT, connectionId: str, localSdp: str):
    """Triggered after webrtcDAT.createOffer — only reached when TD
    renegotiates, since the browser is the offerer on connect/rebuild."""
    webrtcDAT.setLocalDescription(connectionId, "offer", localSdp, stereo=False)
    _send_description(connectionId, "offer", localSdp)
    return


def onAnswer(webrtcDAT: webrtcDAT, connectionId: str, localSdp: str):
    """Triggered after webrtcDAT.createAnswer — the normal path for a browser offer."""
    webrtcDAT.setLocalDescription(connectionId, "answer", localSdp, stereo=False)
    _send_description(connectionId, "answer", localSdp)
    return


def onNegotiationNeeded(webrtcDAT: webrtcDAT, connectionId: str):
    """Triggered when a TD-side change needs negotiation (addTrack/removeTrack)
    — only an offerer can add m-lines, so TD must offer here."""
    webrtcDAT.createOffer(connectionId)
    return


def onIceCandidate(
    webrtcDAT: webrtcDAT, connectionId: str, candidate: str, lineIndex: int, sdpMid: str
):
    _send_ice(connectionId, candidate, lineIndex, sdpMid)
    return


def onIceCandidateError(webrtcDAT: webrtcDAT, connectionId: str, errorText: str):
    # Non-fatal: a peer that genuinely fails to connect is caught browser-side
    # by connectionState, which rebuilds and re-offers.
    print("webrtc-callbacks: ICE candidate error on %s - %s" % (connectionId, errorText))
    return


def onTrack(webrtcDAT: webrtcDAT, connectionId: str, trackId: str, type: str):
    # v1 media is TD -> web only, so an inbound track is unexpected. Ignored
    # rather than refused, so a webcam/mic direction later stays additive.
    return


def onRemoveTrack(webrtcDAT: webrtcDAT, connectionId: str, trackId: str, type: str):
    return


def onDataChannel(webrtcDAT: webrtcDAT, connectionId: str, channelName: str):
    return  # data channels are out of scope for v1 - signaling rides the WebSocket


def onDataChannelOpen(webrtcDAT: webrtcDAT, connectionId: str, channelName: str):
    return


def onDataChannelClose(webrtcDAT: webrtcDAT, connectionId: str, channelName: str):
    return


def onData(webrtcDAT: webrtcDAT, connectionId: str, channelName: str, data: str):
    return


def onConnectionStateChange(webrtcDAT: webrtcDAT, connectionId: str, newState: str):
    # Nothing to do: the browser monitors its own connectionState and
    # rebuilds a dead peer itself, which re-offers through here.
    return


def onSignalingStateChange(webrtcDAT: webrtcDAT, connectionId: str, newState: str):
    return


def onIceConnectionStateChange(webrtcDAT: webrtcDAT, connectionId: str, newState: str):
    return


def onIceGatheringStateChange(webrtcDAT: webrtcDAT, connectionId: str, newState: str):
    # `complete` is end-of-candidates. Some builds also deliver that as an
    # empty candidate through onIceCandidate; both stay wired since a repeated
    # addIceCandidate(null) is a harmless no-op browser-side.
    if newState == "complete":
        _send_ice(connectionId, None, None, None)
    return
