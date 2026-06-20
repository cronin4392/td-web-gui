# TouchDesigner Communication Protocols

## Network / Data Protocols

| Protocol | Use Case |
|---|---|
| **OSC** (Open Sound Control) | Send/receive continuous control data, parameter values, and messages between creative software, hardware controllers, and other TouchDesigner instances over UDP. Supported via OSC In/Out CHOP and OSC In/Out DAT. |
| **UDP** (User Datagram Protocol) | Low-latency, connectionless transport for raw data packets between TouchDesigner and any external system. Underpins OSC and Art-Net. Supported via UDP In/Out DAT. |
| **TCP/IP** | Reliable, connection-oriented protocol for streaming or messaging data to external applications, hardware, and servers. Supported via TCP/IP DAT; also underlies WebSocket, SocketIO, and Touch In/Out. |
| **WebSocket** | Real-time bidirectional communication with web browsers and web apps. Supported via the WebSocket DAT; the Web Server DAT also hosts a WebSocket server. |
| **HTTP** | TouchDesigner acts as an HTTP client (GET, POST, PUT, DELETE to REST APIs) via the Web Client DAT, and as a web server via the Web Server DAT. |
| **SocketIO** | Event-based real-time communication layered over WebSocket, common in Node.js apps. Supported via the SocketIO DAT. |
| **MQTT** | Lightweight publish/subscribe protocol for IoT devices and sensor networks. TouchDesigner connects as a client to an external broker via the MQTT Client DAT. |
| **WebRTC** | Peer-to-peer real-time video, audio, and data streaming between browsers or applications. Supported via the WebRTC DAT with Video Stream In/Out TOPs and Audio Stream In/Out CHOPs. |

## Video Sharing Protocols

| Protocol | Use Case |
|---|---|
| **NDI** (Network Device Interface) | Share high-quality video over a standard LAN between TouchDesigner and other NDI-capable apps (e.g., OBS, Resolume, vMix). Supported via NDI In/Out TOP. |
| **Spout** (Windows) | GPU shared-memory texture sharing between applications on the same Windows machine with near-zero latency and no compression. Supported via Syphon/Spout In/Out TOP. |
| **Syphon** (macOS) | macOS equivalent of Spout — shares GPU textures between apps on the same Mac. Supported via Syphon/Spout In/Out TOP. |
| **RTMP** (Real-Time Messaging Protocol) | Stream compressed video/audio to live platforms such as YouTube, Twitch, and Facebook Live. Supported via Video Stream Out TOP. |
| **RTSP** (Real-Time Streaming Protocol) | Receive or host audio/video streams over a network. TouchDesigner receives RTSP streams via Video Stream In TOP and hosts an RTSP server via Video Stream Out TOP. |
| **HLS** (HTTP Live Streaming) | Receive Apple's adaptive streaming protocol for browser-based and CDN video playback. Supported via Video Stream In TOP. |
| **SRT** (Secure Reliable Transport) | Low-latency video transport over unreliable networks. TouchDesigner sends and receives SRT via Video Stream Out/In TOPs. |
| **ST 2110** (SMPTE) | Professional broadcast IP standard for uncompressed video, audio, and metadata over IP. Supported via ST2110 In/Out TOPs and ST2110 Device CHOP with compatible hardware. |

## Lighting / DMX Protocols

| Protocol | Use Case |
|---|---|
| **DMX512** | The foundational lighting control standard for stage and architectural fixtures. Supported via DMX In/Out CHOP with USB/hardware interfaces (e.g., Enttec devices). |
| **Art-Net** | DMX512 over UDP/Ethernet for large-scale lighting control across standard networks. Natively supported in DMX In/Out CHOP and DMX Out POP (default port 6454). |
| **sACN** (Streaming ACN / E1.31) | DMX-over-IP with multicast support, used in professional lighting installations. Supported in DMX In/Out CHOP and DMX Out POP (default port 5568). |
| **KiNET** | Proprietary DMX-over-IP protocol for Philips Color Kinetics LED systems. Supported in DMX In/Out CHOP and DMX Out POP (default port 6038). |

## MIDI / Audio Protocols

| Protocol | Use Case |
|---|---|
| **MIDI** | Send/receive note, CC, program change, pitch bend, and SysEx messages between instruments, controllers, and software. Supported via MIDI In/Out CHOP and MIDI In DAT. |
| **Ableton Link** | Synchronize tempo and beat phase across multiple apps on a local network without a master. Supported via the Ableton Link CHOP. |
| **TDAbleton** | First-party deep integration with Ableton Live — exposes songs, tracks, clips, and MIDI data — via a Max for Live device communicating over OSC/UDP. |
| **Dante** | Professional multi-channel audio networking over IP by Audinate. Supported via the Dante CHOP for sending and receiving audio channels on a Dante network. |
| **LTC** (Linear Timecode / SMPTE) | SMPTE timecode encoded as an audio signal for syncing TouchDesigner to external video, film, or show control systems. Supported via LTC In/Out CHOP. |

## Serial / Hardware Protocols

| Protocol | Use Case |
|---|---|
| **Serial / RS-232** | Direct serial port communication with microcontrollers (e.g., Arduino), custom hardware, industrial devices, and legacy equipment. Supported via Serial CHOP and Serial DAT. |

## Touch / Sensor Protocols

| Protocol | Use Case |
|---|---|
| **TUIO** | Open OSC-based protocol for multitouch surfaces and tangible object tracking from interactive tables and custom hardware. Supports TUIO 1.1 and 2.0 via the TUIO In DAT. |
| **Windows Multitouch** (WM_TOUCH / Pointer API) | Native Windows touch and pointer event support for direct multitouch input from touchscreens and tablets. Supported via Multi Touch In DAT. |

## TouchDesigner-Native Protocols

| Protocol | Use Case |
|---|---|
| **Touch In/Out CHOP** | Proprietary protocol for sharing CHOP channel data between TouchDesigner instances over TCP or UDP in multi-system setups. |
| **Touch In/Out TOP** | Shares compressed or uncompressed texture/image data between multiple TouchDesigner processes on the same machine or across a network. |
| **Touch In/Out DAT** | Shares table and text DAT data between TouchDesigner instances over a network. |
| **Pipe In/Out CHOP** | Named pipe inter-process communication for data exchange between two TouchDesigner processes on the same machine, or with an external program writing to a named pipe. |
