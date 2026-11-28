import { createEffect, createMemo, on, onCleanup, type JSX } from 'solid-js';
import { HEARTBEAT_MS, isOn, type UsageReport } from '@domain/usage/usage';
import { InputClient } from '@/playback/clients';
import { layerIds } from '@/playback/layers';
import { usePlayback } from '@/playback/PlaybackProvider';
import { useLiveMode } from './LiveMode';
import { postReport } from './usage-api';

/** Must render inside `PlaybackProvider` and `LiveModeProvider`. */
export function UsageReporter(): JSX.Element {
  const { connections } = usePlayback();
  const scheme = InputClient.signal('activeColorScheme');
  const live = useLiveMode();

  // Memoized, like PlaybackProvider's level binding: `signal()` warns on every call for a read-only name.
  const layers = createMemo(() =>
    layerIds.flatMap((layer) => {
      const connection = connections()[layer];
      if (!connection) return [];
      const level = connection.signal('level');
      return [
        {
          layer,
          synced: () => connection.status() === 'synced',
          activeScene: connection.signal('activeScene'),
          level,
          // `level` arrives frame by frame; only crossing the off level is worth a post.
          on: createMemo(() => isOn(level.value() ?? 0)),
          layout: connection.signal('layout'),
          color: connection.signal('color'),
        },
      ];
    }),
  );

  // A Loader that dropped keeps its last values, and would read as still playing.
  const reporting = () => layers().filter((layer) => layer.synced());

  function report(): UsageReport {
    return {
      layers: reporting().map((layer) => ({
        layer: layer.layer,
        activeScene: layer.activeScene.value() ?? '',
        level: layer.level.value() ?? 0,
        layout: layer.layout.value() ?? '',
        color: layer.color.value() ?? '',
      })),
      activeColorScheme: scheme.value() ?? '',
    };
  }

  const splitsASpan = createMemo(() =>
    JSON.stringify([
      reporting().map((layer) => [
        layer.layer,
        layer.activeScene.value(),
        layer.on(),
        layer.layout.value(),
        layer.color.value(),
      ]),
      scheme.value(),
    ]),
  );
  const isLive = createMemo(() => live.status().on);

  createEffect(
    on([isLive, splitsASpan], ([liveNow]) => {
      if (!liveNow) return;
      const send = () =>
        void postReport(report()).then(live.setStatus, (error: unknown) =>
          console.warn('[vj-gui] usage report failed', error),
        );
      send();
      const heartbeat = setInterval(send, HEARTBEAT_MS);
      onCleanup(() => clearInterval(heartbeat));
    }),
  );

  return null;
}
