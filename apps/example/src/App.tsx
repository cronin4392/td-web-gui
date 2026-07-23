import { Show } from 'solid-js'
import { createTDClient } from 'td-core'
import { instances, type ExampleParams } from './td.config'

// One factory per TD instance, typed by that instance's param schema.
const Example = createTDClient<ExampleParams>()

const example = instances[0]

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

export function App() {
  return (
    <main>
      <h1>td-web-gui · example</h1>
      <p>
        Bound to instance <code>{example.id}</code> at <code>{example.url}</code>
      </p>

      <Example.Provider url={example.url} instance={example.id}>
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
      </Example.Provider>
    </main>
  )
}
