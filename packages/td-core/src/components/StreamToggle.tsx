/**
 * `<StreamToggle>` — checkbox that starts and stops one stream's TD-side encoder.
 *
 * Shaped like `<Toggle>` and behaves like it — optimistic write, corrected by
 * TD's next `stream-state` — but binds a **stream id**, not a parameter, so it
 * takes no schema typing and needs no `REGISTRY` entry. It reads the nearest
 * `<Provider video>`'s peer, the same way `<Video>` does.
 *
 * Renders disabled until TD has said whether the stream is on: an id with no
 * generated encoder never becomes clickable, which is the difference between
 * "off" and "TD can't serve this".
 */

import { splitProps, type JSX } from 'solid-js';
import { useTDVideoStream } from '../context';
import { callHandler } from './TextInput';

export interface StreamToggleProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'value' | 'type' | 'checked'
> {
  /** Announced stream id to control. Omit for the primary stream. */
  stream?: string;
}

export function StreamToggle(props: StreamToggleProps): JSX.Element {
  const video = useTDVideoStream();
  const [, rest] = splitProps(props, ['stream', 'disabled', 'onChange']);

  const enabled = () => video.enabled(props.stream);

  return (
    <input
      type="checkbox"
      class="td-stream-toggle"
      {...rest}
      checked={enabled() ?? false}
      disabled={props.disabled ?? enabled() === undefined}
      onChange={(event) => {
        // `stream` resolves to the primary id only once TD has announced one,
        // and `enabled() !== undefined` above is exactly that guarantee — so by
        // the time this can fire, there is an id to name.
        const id = props.stream ?? video.streams()[0]?.id;
        if (id !== undefined) video.setEnabled(id, event.currentTarget.checked);
        callHandler(props.onChange, event);
      }}
    />
  );
}
