import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import {
  createTDClient,
  createTDHandler,
  StreamToggle,
  TDCallError,
  useTDConnection,
  useTDVideoStream,
  Video,
  type ErrorMessage,
} from 'td-core';
import {
  example1Readonly,
  example2Readonly,
  instances,
  VIDEO_TILES,
  type Example1Calls,
  type Example1Handlers,
  type Example1Params,
  type Example2Params,
} from './td.config';

// One factory per TD instance, typed by that instance's param schema. The
// factories are purely compile-time: `Example1.TextInput` and
// `Example2.TextInput` are the same component behind different `name` types, and
// each binds to whichever `<Provider>` it renders inside. That is what makes the
// two columns below independent without either knowing the other exists.
//
// Instance 1 also carries `Calls`/`Handlers` generics — the two independent
// namespaces for "what TD exposes" (`call`/`notify`) and "what the web
// exposes" (`handle`) — so `Example1.useConnection().call('print', ...)`
// autocompletes and typos are compile errors, same as a param name.
const Example1 = createTDClient<Example1Params, Example1Calls, Example1Handlers>();
const Example2 = createTDClient<Example2Params>();

const [example1, example2] = instances;

const blendModes = [
  { value: 'over', label: 'Over' },
  { value: 'add', label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
];

/** How long a non-fatal error stays on screen before the status line clears it. */
const ERROR_LINGER_MS = 10_000;

/**
 * Show an inbound error for a while, then drop it.
 *
 * `lastError` is deliberately sticky — the connection keeps a record of the most
 * recent error and never clears it, so late-mounting UI can still find out what
 * happened. Most of what arrives there is a *moment*, not a state:
 * `video_single_viewer` reports that this browser has just taken the stream from
 * another one, and is over by the time it renders. Binding a status line
 * straight to `lastError` therefore leaves a red string on a healthy connection
 * for the rest of the session. Deciding how long an error is worth showing is
 * the app's call, not the library's, which is why this lives here.
 */
function useRecentError(lastError: () => ErrorMessage | undefined) {
  const [recent, setRecent] = createSignal<ErrorMessage>();

  createEffect(() => {
    const error = lastError();
    if (!error) return;
    setRecent(error);
    const timer = setTimeout(() => setRecent(undefined), ERROR_LINGER_MS);
    onCleanup(() => clearTimeout(timer));
  });

  return recent;
}

/**
 * Connection-state readout. Reads the reactive `status`, `congested`,
 * and `lastError` off the nearest provider's connection — the same surface the
 * reconnect/backoff, heartbeat, and backpressure logic drives — so the UI can
 * show a live "reconnecting…" / "congested" indicator instead of silently
 * freezing. Must render inside a `<Provider>` to see the connection.
 *
 * Shared by both columns, and deliberately **not** built from either factory:
 * `useTDConnection` reads the nearest provider from context, so one untyped
 * component serves every instance. Only the parts that name a parameter need the
 * schema typing. With two instances live, this is also the clearest proof they
 * have independent lifecycles — close one `.toe` and only its column drops to
 * "reconnecting…".
 */
function StatusBar(props: { id: string; url: string }) {
  const conn = useTDConnection();
  const recentError = useRecentError(conn.lastError);

  const label = () => {
    switch (conn.status()) {
      case 'synced':
        return 'connected';
      case 'open':
        return 'handshaking…';
      case 'connecting':
        return 'reconnecting…';
      case 'closed':
        return 'closed';
    }
  };

  return (
    <p class="status">
      <span classList={{ dot: true, [conn.status()]: true }} aria-hidden="true" />
      {label()}
      <Show when={conn.congested()}>
        {' · '}
        <strong>congested</strong>
      </Show>
      <Show when={recentError()}>
        {(err) => (
          <span class="error">
            {' · error: '}
            {err().code}
            {err().ref ? ` (${err().ref})` : ''}
          </span>
        )}
      </Show>
      <span class="caption">
        {' · '}
        <code>{props.id}</code> at <code>{props.url}</code>
      </span>
    </p>
  );
}

/**
 * Audio device picker — a `<Select>` whose options come from
 * TouchDesigner rather than from this app. Instance 1 only; instance 2's schema
 * has no menu-backed param at all.
 *
 * Every other control here binds a param whose *options* (if any) are authored
 * on the web side. This one can't be: TD's device menu keys are machine-specific
 * GUIDs, and the list changes when hardware is plugged in. TD announces them
 * over the `menus` message, so `<Select>` is given no `options` prop at all.
 *
 * The reload button exists because that list can go stale while the page is
 * open, and TD has no event to push from — plugging in an interface leaves the
 * parameter's value untouched and only changes the set of legal values, which no
 * Parameter Execute callback reports. Asking on demand beats TD polling forever
 * on the chance someone plugged something in.
 */
function AudioDevicePicker() {
  const conn = useTDConnection();

  return (
    <section>
      <label>
        Audio input device
        <Example1.Select name="audiodevice" />
      </label>
      <button
        type="button"
        onClick={() => conn.requestMenus()}
        disabled={conn.status() !== 'synced'}
      >
        Reload devices
      </button>
      <p class="caption">
        Options come from TouchDesigner, not from this app — see <code>menus</code> in the wire
        format. Plug in an interface, then hit reload.
      </p>
    </section>
  );
}

/** Instance 1's named-call demo — the bidirectional channel from prds/CALLS.md. */
function CallsDemo() {
  // Captured at setup: Solid resolves context from the current owner, and the
  // event handlers below run after paint with none. `Example1.useConnection()`
  // is the typed view — `call('print' | 'echo')` and nothing else.
  const conn = Example1.useConnection();
  // The same socket, untyped, for the deliberate unknown-handler demo below.
  const raw = useTDConnection();
  const [text, setText] = createSignal('');
  const [printResult, setPrintResult] = createSignal<string>();
  const [echoResult, setEchoResult] = createSignal<string>();
  const [callError, setCallError] = createSignal<string>();

  createTDHandler<{ text: string }>('alert', (args) => {
    alert(args.text);
  });

  function describe(error: unknown): string {
    return error instanceof TDCallError ? error.code : String(error);
  }

  async function printInTD() {
    setCallError(undefined);
    try {
      const result = await conn.call('print', { text: text() });
      setPrintResult(JSON.stringify(result));
    } catch (error) {
      setCallError(describe(error));
    }
  }

  async function echoFromTD() {
    setCallError(undefined);
    try {
      const result = await conn.call('echo', { hello: 'world' });
      setEchoResult(JSON.stringify(result));
    } catch (error) {
      setCallError(describe(error));
    }
  }

  async function callUnknown() {
    setCallError(undefined);
    try {
      // The untyped connection, not `conn`: naming a handler outside
      // `Example1Calls` is a compile error on the typed one, which is the point.
      await raw.call('does-not-exist');
    } catch (error) {
      setCallError(describe(error));
    }
  }

  return (
    <section>
      <h3>Calls</h3>
      <label>
        Text
        <input
          type="text"
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder="Type something to print in TD…"
        />
      </label>
      <div class="td-call-buttons">
        <button type="button" onClick={printInTD} disabled={conn.status() !== 'synced'}>
          print in TD
        </button>
        <button type="button" onClick={echoFromTD} disabled={conn.status() !== 'synced'}>
          echo
        </button>
        <button type="button" onClick={callUnknown} disabled={conn.status() !== 'synced'}>
          call unknown handler
        </button>
      </div>
      <Show when={printResult()}>
        <p class="td-call-result">
          print result: <code>{printResult()}</code>
        </p>
      </Show>
      <Show when={echoResult()}>
        <p class="td-call-result">
          echo result: <code>{echoResult()}</code>
        </p>
      </Show>
      <Show when={callError()}>
        <p class="td-call-error">
          call error: <code>{callError()}</code>
        </p>
      </Show>
      <p class="caption">
        TD can call back: from its Textport,{' '}
        <code>
          parent.WebGuiServer.Notify('alert', {'{'}'text': 'hello from TD'{'}'})
        </code>{' '}
        pops a browser alert.
      </p>
    </section>
  );
}

/**
 * Instance 1's readouts — CHOP channels and DAT cells read straight out of the
 * operator, with no parameter behind them. One-way TD → web.
 *
 * They bind exactly like the parameters above: same names, same components. Only
 * `example1Readonly` on the `<Provider>` marks them out.
 */
function Example1Readouts() {
  return (
    <section>
      <h3>Readouts</h3>

      <p>
        Frame rate: <Example1.Value name="fps" format={(v) => `${Number(v).toFixed(1)} fps`} />
        {' · '}
        last frame <Example1.Value name="cooking" format={(v) => (v ? 'cooked' : 'skipped')} />
      </p>

      <p>
        Bands (three CHOP channels as one array):{' '}
        <Example1.Value
          name="bands"
          format={(v) =>
            Array.isArray(v) ? v.map((n) => Number(n).toFixed(3)).join(' · ') : String(v)
          }
        />
      </p>
      {/* The same array in <Vector>: a readout needs no special component, since
          the wire shape matches a ParGroup's. Disabled, being read-only. */}
      <Example1.Vector name="bands" labels={['low', 'mid', 'high']} step={0.001} />

      <p>
        Now playing: <Example1.Value name="track" />
      </p>

      <p>Cue table (a whole DAT, as string[][])</p>
      {/* Row 0 holds the column names, so `header` lifts it into a <thead>. */}
      <Example1.Table name="cues" header />
      <p class="caption">
        Sources are in <code>/project1/readouts</code>. Edit <code>nowplaying</code> or{' '}
        <code>cue_table</code> in TouchDesigner and these update live.
      </p>
    </section>
  );
}

/**
 * One instance's video wall — every stream that instance announces, rendered at
 * once. `<Provider video>` opens **one** WebRTC peer per instance and every tile
 * is a track on it, which is why the grid is driven by `video.streams()` (the id
 * → mid map TD announces) rather than by a peer per tile.
 *
 * Shared by both columns for the same reason `StatusBar` is: a stream id is not
 * part of the param schema, so `<Video>` was never schema-typed, and
 * `useTDVideoStream` finds the nearest provider's peer. Two of these on one page
 * are two peers — the ids repeat across them (`tile1`…`tile4` in both configs)
 * and never collide, because each resolves inside its own provider.
 *
 * The tile count is whatever TD announces, up to the `receivers` m-lines our
 * offer carried. Rendering the list rather than a fixed four is what makes a
 * short announce visible as missing tiles instead of as silently black ones.
 *
 * Each overlay reads that stream's own `streamStatus(id)`, not the peer-wide
 * `status()`: the peer reaches `connected` as soon as *any* track flows, so a
 * tile still waiting for its own track would otherwise show a frozen black box
 * with no explanation. `off` is one of its values, and the one to try here —
 * unchecking a tile stops that stream's encoder and everything feeding it in TD,
 * which is what makes a wall bigger than the machine can run at once affordable.
 */
function VideoWall() {
  const video = useTDVideoStream();
  const running = () => video.streams().filter((s) => video.enabled(s.id) !== false).length;

  return (
    <section>
      <h3>
        Video wall — {video.streams().length} of {VIDEO_TILES} streams announced, {running()}{' '}
        encoding
      </h3>
      <div class="video-grid">
        <For
          each={video.streams()}
          fallback={
            <p class="caption">
              No streams announced yet — check that this instance’s config sets <code>WEBRTC</code>{' '}
              and <code>STREAMS</code>, and that its Web Server DAT is up.
            </p>
          }
        >
          {(stream) => (
            <figure>
              <div class="video-tile">
                {/* Selects by announced id: several tiles on one id would share
                    a single decode, and a renegotiation that shifts mids rebinds
                    here without remounting. */}
                <Video stream={stream.id} />
                <Show when={video.streamStatus(stream.id) !== 'connected'}>
                  <div class="video-overlay">{video.streamStatus(stream.id)}…</div>
                </Show>
              </div>
              <figcaption class="caption">
                {/* Not schema-typed, and needs no REGISTRY entry: it drives the
                    generated encoder td-core owns, selected by the same
                    announced id <Video> uses. Turning it off stops that stream's
                    whole chain cooking in TD; the track stays negotiated, so it
                    comes back on the next frame with no renegotiation. */}
                <label class="video-switch">
                  <StreamToggle stream={stream.id} />
                  {stream.label ?? stream.id}
                </label>
                mid <code>{stream.mid}</code>
              </figcaption>
            </figure>
          )}
        </For>
      </div>
    </section>
  );
}

/**
 * Instance 1 — the kitchen sink: one control of every kind, every readout shape,
 * both menu cases, and a four-tile wall.
 */
function Example1Panel() {
  return (
    // `video` is opt-in per provider — without it no RTCPeerConnection is
    // created at all, which is exactly why it is per-provider: this page opens
    // two peers because two providers asked for one, not one shared peer split
    // between them. `receivers` is how many recvonly video m-lines each offer
    // carries, and so the ceiling on how many tracks that TD can attach when it
    // answers: an answerer cannot add m-lines, so a wall of four needs all four
    // offered up front or the surplus streams have nowhere to land.
    //
    // `readonly` is web-side only, never sent over the wire — it just disables
    // readout controls from the first paint.
    <Example1.Provider
      url={example1.url}
      instance={example1.id}
      readonly={[...example1Readonly]}
      video={{ receivers: VIDEO_TILES }}
    >
      <h2>Instance 1 · control surface</h2>
      <StatusBar id={example1.id} url={example1.url} />

      <section>
        <label>
          Message
          <Example1.TextInput name="message" placeholder="Type a message…" />
        </label>
      </section>

      <section>
        <label>
          Intensity
          <Example1.NumberInput name="intensity" min={0} max={1} step={0.01} />
        </label>
        {/* Slider sends are rAF-throttled by default; the readout
            still tracks every optimistic move. */}
        <Example1.RangeInput name="intensity" min={0} max={1} step={0.01} />
        <p>
          Current: <Example1.Value name="intensity" format={(v) => Number(v).toFixed(2)} />
        </p>
      </section>

      <section>
        <label>
          Enabled
          <Example1.Toggle name="enabled" />
        </label>
      </section>

      <section>
        <p>Button modes</p>
        {/* Fire-and-forget: sends a `pulse` message, holds no state. */}
        <Example1.Button name="reset" mode="pulse">
          Reset (pulse)
        </Example1.Button>
        {/* Momentary bool: true while held, false on release. */}
        <Example1.Button name="gate" mode="hold">
          Gate (hold)
        </Example1.Button>
        {/* Same wire path as <Toggle>, rendered as a button. */}
        <Example1.Button name="mute" mode="toggle">
          Mute (toggle)
        </Example1.Button>
      </section>

      <section>
        <label>
          Blend mode
          {/* Web-authored options: the keys are stable, documented TD menu
              strings, so hardcoding them is fine and stays the default. */}
          <Example1.Select name="blendmode" options={blendModes} />
        </label>
      </section>

      <AudioDevicePicker />

      <CallsDemo />

      <section>
        <p>Position</p>
        <Example1.Vector name="position" labels={['x', 'y', 'z']} step={0.01} />
      </section>

      <section>
        <label>
          Color
          <Example1.Color name="color" alpha />
        </label>
      </section>

      <Example1Readouts />

      <VideoWall />
    </Example1.Provider>
  );
}

/**
 * Instance 2 — a second TD process on its own port, with its own vocabulary.
 *
 * Nothing here is shared with the column beside it but the page. Its parameter
 * names differ (`label`/`opacity`/`tint` against instance 1's
 * `message`/`intensity`/`color`) even where the same TD parameter backs them,
 * which is the compile-time half of the isolation; the runtime half is a
 * separate socket, a separate peer, and a separate reconnect clock.
 */
function Example2Panel() {
  return (
    <Example2.Provider
      url={example2.url}
      instance={example2.id}
      readonly={[...example2Readonly]}
      video={{ receivers: VIDEO_TILES }}
    >
      <h2>Instance 2 · playback node</h2>
      <StatusBar id={example2.id} url={example2.url} />

      <section>
        <label>
          Label
          <Example2.TextInput name="label" placeholder="Type a label…" />
        </label>
      </section>

      <section>
        <label>
          Opacity
          {/* Renders disabled: `opacity` is in example2Readonly, because TD's
              registry flags it `writable: False`. The slider still tracks TD. */}
          <Example2.RangeInput name="opacity" min={0} max={1} step={0.01} />
        </label>
        <p>
          Current: <Example2.Value name="opacity" format={(v) => Number(v).toFixed(2)} />
        </p>
        <p class="caption">
          Read-only from the web — TouchDesigner drives this one. The flag lives in TD’s registry
          and never crosses the wire; the disabled state comes from this app’s own read-only set.
        </p>
      </section>

      <section>
        <label>
          Playing
          <Example2.Toggle name="playing" />
        </label>
      </section>

      <section>
        <Example2.Button name="restart" mode="pulse">
          Restart (pulse)
        </Example2.Button>
      </section>

      <section>
        <label>
          Tint
          <Example2.Color name="tint" alpha />
        </label>
      </section>

      <section>
        <h3>Readouts</h3>
        <p>
          Frame rate: <Example2.Value name="fps" format={(v) => `${Number(v).toFixed(1)} fps`} />
        </p>
        <Example2.Vector name="levels" labels={['low', 'mid', 'high']} step={0.001} />
        <p class="caption">
          Two CHOP readouts and no table — this instance registers no DAT readout at all.
        </p>
      </section>

      <VideoWall />
    </Example2.Provider>
  );
}

export function App() {
  return (
    <main>
      <h1>td-web-gui · example</h1>
      <p class="caption">
        Two TouchDesigner instances, one page. Each column owns its connection, its WebRTC peer, and
        its own parameter schema; nothing is shared between them.
      </p>

      <div class="columns">
        <div class="column">
          <Example1Panel />
        </div>
        <div class="column">
          <Example2Panel />
        </div>
      </div>
    </main>
  );
}
