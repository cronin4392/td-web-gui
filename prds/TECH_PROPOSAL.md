# Tech Proposal: TD Web GUI

## Overview

Web UI that communicates bidirectionally with TouchDesigner for control data (text, numbers, messages) and receives real-time video from TD.

## Tech Stack

### Frontend

**Solid.js** (TypeScript, Vite)

- Fine-grained reactivity via signals — WebSocket messages update only the exact DOM nodes bound to changed values
- No virtual DOM overhead; ideal for high-frequency TD parameter updates
- Small bundle size

### Communication

| Channel | Protocol | TD Component | Browser API |
|---|---|---|---|
| Text / numbers / messages (bidirectional) | **WebSocket** | Web Server DAT or WebSocket DAT | Native `WebSocket` |
| Video (TD → Web) | **WebRTC** | WebRTC DAT + Video Stream Out TOP | Native `RTCPeerConnection` |

### Architecture

```
┌─────────────────────────────────────┐
│  Any Solid.js Project               │
│                                     │        ┌──────────────────┐
│  ┌───────────────────────────────┐  │        │                  │
│  │  td-core (reusable lib)       │  │        │  TouchDesigner   │
│  │                               │  │        │                  │
│  │  • createTDConnection()       │◄─┼──WS───►│  Web Server DAT  │
│  │  • createTDVideoStream()      │◄─┼─WebRTC─│  WebRTC DAT      │
│  │  • <TDVideo /> component      │  │        │                  │
│  └───────────────────────────────┘  │        └──────────────────┘
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Project-specific UI          │  │
│  │  (consumes td-core signals)   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

No backend server required — TouchDesigner acts as the server via its Web Server DAT (WebSocket) and WebRTC DAT (video).

### Package Structure

**`td-core`** — reusable Solid.js library, droppable into any Solid project

- **Primitives** (reactive signals + connection logic):
  - `createTDConnection(url)` — WebSocket connection manager, returns reactive connection state and `send()` method
  - `createTDSignal(name)` — binds a Solid signal to a named TD parameter, syncs bidirectionally over WebSocket
  - `createTDStore(paramMap)` — batch version for grouped parameters
  - `createTDVideoStream(config)` — WebRTC setup, returns a `MediaStream` signal
- **Components — Controls** (bidirectional, bound to TD parameters):
  - `<TDTextInput name="par_name" />` — text input bound to a TD string parameter; sends on change, updates when TD pushes a new value
  - `<TDNumberInput name="par_name" />` — numeric input with optional `min`, `max`, `step`; bidirectional sync
  - `<TDRange name="par_name" />` — range slider with optional `min`, `max`, `step`; sends continuous values to TD, reflects TD-side changes
- **Components — Display**:
  - `<TDVideo />` — renders a WebRTC video stream
- **Components — Infrastructure**:
  - `<TDProvider />` — context provider for sharing a connection across the component tree

All control components share a common pattern: they accept a `name` prop (the TD parameter name), use `createTDSignal` internally, and support standard HTML input props for styling/accessibility. They can be used unstyled or wrapped with custom styling.

**Project-specific UI** — imports `td-core`, wires signals and components to build custom interfaces

```tsx
// Example usage
<TDProvider url="ws://localhost:9980">
  <TDTextInput name="text1" placeholder="Enter message" />
  <TDNumberInput name="opacity" min={0} max={1} step={0.01} />
  <TDRange name="speed" min={0} max={10} />
  <TDVideo />
</TDProvider>
```

### Key Patterns

- **Signals** for reactive TD parameter state (`createSignal` per parameter or `createStore` for grouped state)
- **WebSocket service** — singleton connection manager that parses incoming messages and writes to signals
- **WebRTC service** — handles signaling (over the same WebSocket connection) and attaches the `MediaStream` to a `<video>` element
