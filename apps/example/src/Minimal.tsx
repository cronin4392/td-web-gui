/**
 * The smallest thing that works: one TouchDesigner instance, five controls, one
 * video tile. Served at `/minimal.html` beside the full tour in `App.tsx`.
 *
 * Start here. Everything below is the whole idea of the library — a factory
 * typed by your parameter names, a provider holding the connection, and
 * controls that bind a name. `App.tsx` adds a second instance, every remaining
 * control, readouts, calls, and a four-tile wall; none of that changes what is
 * on this page.
 *
 * The names (`message`, `intensity`, …) are the keys of `REGISTRY` in
 * `td/Example1/config.py`. They are friendly names on the wire, not operator
 * paths, so TouchDesigner can rename or move the backing parameter without this
 * file knowing. Nothing checks that the two sides agree — a name only one side
 * knows is silently ignored at runtime.
 */

import { render } from 'solid-js/web';
import { useTDConnection, createTDClient } from 'td-core';
import { instances, type Example1Params } from './td.config';
import './index.css';

const TD = createTDClient<Example1Params>();

const [example1] = instances;

/** Connected / reconnecting, so a dead socket doesn't look like a frozen page. */
function Status() {
  const conn = useTDConnection();
  return <p class="status">{conn.status() === 'synced' ? 'connected' : 'connecting…'}</p>;
}

function Minimal() {
  return (
    // `video` is opt-in: without it no RTCPeerConnection is created at all.
    // `receivers` is how many tracks TD is allowed to attach — it must be at
    // least the project's STREAMS count, and cannot grow after TD answers.
    <TD.Provider url={example1.url} instance={example1.id} video={{ receivers: 1 }}>
      <h1>td-core · minimal</h1>
      <Status />

      <section>
        <label>
          Message
          <TD.TextInput name="message" placeholder="Type a message…" />
        </label>
      </section>

      <section>
        <label>
          Intensity
          <TD.RangeInput name="intensity" min={0} max={1} step={0.01} />
        </label>
        {/* Both controls bind the same name, so they share one signal: drag the
            slider and this tracks it, and so does a change made in TD. */}
        <p>
          Current: <TD.Value name="intensity" format={(v) => Number(v).toFixed(2)} />
        </p>
      </section>

      <section>
        <label>
          Enabled
          <TD.Toggle name="enabled" />
        </label>
      </section>

      <section>
        {/* A pulse holds no state — it fires TD's par.pulse() and nothing else. */}
        <TD.Button name="reset" mode="pulse">
          Reset
        </TD.Button>
      </section>

      <section>
        {/* No `stream` prop: takes the first stream the project announces. */}
        <div class="video-tile minimal-tile">
          <TD.Video />
        </div>
      </section>
    </TD.Provider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

render(() => <Minimal />, root);
