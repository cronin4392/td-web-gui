import { For, Show } from 'solid-js'
import { createTDClient } from 'td-core'
import { instances, VIDEO_TILES, type ExampleParams } from './td.config'

// One factory per TD instance, typed by that instance's param schema.
const Example = createTDClient<ExampleParams>()

const example = instances[0]

const blendModes = [
  { value: 'over', label: 'Over' },
  { value: 'add', label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
]

/**
 * Connection-state readout (Phase 3). Reads the reactive `status`, `congested`,
 * and `lastError` off the nearest provider's connection — the same surface the
 * reconnect/backoff, heartbeat, and backpressure logic drives — so the UI can
 * show a live "reconnecting…" / "congested" indicator instead of silently
 * freezing. Must render inside the `<Provider>` to see the connection.
 */
function StatusBar() {
  const conn = Example.useConnection()

  const label = () => {
    switch (conn.status()) {
      case 'synced':
        return 'connected'
      case 'open':
        return 'handshaking…'
      case 'connecting':
        return 'reconnecting…'
      case 'closed':
        return 'closed'
    }
  }

  return (
    <p class="status">
      <span classList={{ dot: true, [conn.status()]: true }} aria-hidden="true" />
      {label()}
      <Show when={conn.congested()}>
        {' · '}
        <strong>congested</strong>
      </Show>
      <Show when={conn.lastError()}>
        {(err) => (
          <span class="error">
            {' · error: '}
            {err().code}
            {err().ref ? ` (${err().ref})` : ''}
          </span>
        )}
      </Show>
    </p>
  )
}

/**
 * The video wall (Phase 6.7) — every stream this instance announces, rendered
 * at once. `<Provider video>` opens **one** WebRTC peer and every tile is a
 * track on it, which is why the grid is driven by `video.streams()` (the id →
 * mid map TD announces) rather than by a peer per tile.
 *
 * The tile count is whatever TD announces, up to the `receivers` m-lines our
 * offer carried. Rendering the list rather than a fixed eight is what makes a
 * short announce visible as missing tiles instead of as silently black ones.
 *
 * Each overlay reads that stream's own `streamStatus(id)`, not the peer-wide
 * `status()`: the peer reaches `connected` as soon as *any* track flows, so a
 * tile still waiting for its own track would otherwise show a frozen black box
 * with no explanation.
 */
function VideoWall() {
  const video = Example.useVideo()

  return (
    <section>
      <p>
        Video wall (Phase 6.7) — {video.streams().length} of {VIDEO_TILES} streams
        announced
      </p>
      <div class="video-grid">
        <For
          each={video.streams()}
          fallback={
            <p class="caption">
              No streams announced yet — check that the TD project’s config sets{' '}
              <code>WEBRTC</code> and <code>STREAMS</code>, and that its Web Server DAT
              is up.
            </p>
          }
        >
          {(stream) => (
            <figure>
              <div class="video-tile">
                {/* Selects by announced id: several tiles on one id would share
                    a single decode, and a renegotiation that shifts mids rebinds
                    here without remounting. */}
                <Example.Video stream={stream.id} />
                <Show when={video.streamStatus(stream.id) !== 'connected'}>
                  <div class="video-overlay">{video.streamStatus(stream.id)}…</div>
                </Show>
              </div>
              <figcaption class="caption">
                {stream.label ?? stream.id} · mid <code>{stream.mid}</code>
              </figcaption>
            </figure>
          )}
        </For>
      </div>
    </section>
  )
}

export function App() {
  return (
    <main>
      <h1>td-web-gui · example</h1>
      <p>
        Bound to instance <code>{example.id}</code> at <code>{example.url}</code>
      </p>

      {/* `video` is opt-in per provider — without it no RTCPeerConnection is
          created at all, which matters once several instances are live.
          `receivers` is how many recvonly video m-lines our offer carries, and
          so the ceiling on how many tracks TD can attach when it answers: an
          answerer cannot add m-lines, so a wall of 8 needs all 8 offered up
          front or the surplus streams have nowhere to land. */}
      <Example.Provider
        url={example.url}
        instance={example.id}
        video={{ receivers: VIDEO_TILES }}
      >
        <StatusBar />

        <section>
          <label>
            Message
            <Example.TextInput name="message" placeholder="Type a message…" />
          </label>
        </section>

        <section>
          <label>
            Intensity
            <Example.NumberInput name="intensity" min={0} max={1} step={0.01} />
          </label>
          {/* Slider sends are rAF-throttled by default (Phase 3.4); the readout
              still tracks every optimistic move. */}
          <Example.RangeInput name="intensity" min={0} max={1} step={0.01} />
          <p>
            Current: <Example.Value name="intensity" format={(v) => Number(v).toFixed(2)} />
          </p>
        </section>

        <section>
          <label>
            Enabled
            <Example.Toggle name="enabled" />
          </label>
        </section>

        <section>
          <p>Button modes (Phase 4.3/4.4/4.5)</p>
          {/* Fire-and-forget: sends a `pulse` message, holds no state. */}
          <Example.Button name="reset" mode="pulse">
            Reset (pulse)
          </Example.Button>
          {/* Momentary bool: true while held, false on release. */}
          <Example.Button name="gate" mode="hold">
            Gate (hold)
          </Example.Button>
          {/* Same wire path as <Toggle>, rendered as a button. */}
          <Example.Button name="mute" mode="toggle">
            Mute (toggle)
          </Example.Button>
        </section>

        <section>
          <label>
            Blend mode
            <Example.Select name="blendmode" options={blendModes} />
          </label>
        </section>

        <section>
          <p>Position</p>
          <Example.Vector name="position" labels={['x', 'y', 'z']} step={0.01} />
        </section>

        <section>
          <label>
            Color
            <Example.Color name="color" alpha />
          </label>
        </section>

        <VideoWall />
      </Example.Provider>
    </main>
  )
}
