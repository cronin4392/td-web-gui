import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import { HEARTBEAT_MS, type LiveStatus } from '@domain/usage/usage';
import { fetchLive, setLive } from './usage-api';

export interface LiveMode {
  status: Accessor<LiveStatus>;
  /** The server restates its status in every answer, so each one lands here. */
  setStatus: (status: LiveStatus) => void;
  toggle: () => void;
}

const LiveModeContext = createContext<LiveMode>();

export function LiveModeProvider(props: { children: JSX.Element }): JSX.Element {
  const [status, setStatus] = createSignal<LiveStatus>({ on: false, paused: false });
  let toggles = 0;

  // Polled, not read once: another tab can turn Live mode on, and this one must then report too.
  function refresh(): void {
    const asked = toggles;
    void fetchLive().then((answer) => {
      if (asked === toggles) setStatus(answer);
    });
  }
  onMount(() => {
    refresh();
    const poll = setInterval(refresh, HEARTBEAT_MS);
    onCleanup(() => clearInterval(poll));
  });

  function toggle(): void {
    toggles += 1;
    setLive(!status().on).then(setStatus, (error: unknown) =>
      console.warn('[vj-gui] Live mode did not change', error),
    );
  }

  return (
    <LiveModeContext.Provider value={{ status, setStatus, toggle }}>
      {props.children}
    </LiveModeContext.Provider>
  );
}

export function useLiveMode(): LiveMode {
  const live = useContext(LiveModeContext);
  if (!live) throw new Error('useLiveMode needs a <LiveModeProvider> above it');
  return live;
}
