/**
 * `<Video>` — renders one WebRTC stream from the nearest provider's peer.
 *
 * `stream` selects by the id TD announced; omitting it takes the primary
 * stream, so a single-stream app never has to name one. Several `<Video>`
 * elements on the same id are handed the *same* `MediaStream` object, so the
 * browser decodes it once no matter how many tiles show it.
 */

import { createEffect, splitProps, type JSX } from 'solid-js';
import { useTDVideoStream } from '../context';
import { mergeClass } from './props';

export interface VideoProps extends JSX.VideoHTMLAttributes<HTMLVideoElement> {
  /** Announced stream id to render. Omit for the primary stream. */
  stream?: string;
}

export function Video(props: VideoProps): JSX.Element {
  const video = useTDVideoStream();
  const [, rest] = splitProps(props, ['stream', 'class', 'muted']);
  let element!: HTMLVideoElement;

  createEffect(() => {
    // Re-runs when the track arrives or a renegotiation shifts this id onto a
    // different mid — that rebinding is the reason the id → mid map is explicit.
    const media = video.stream(props.stream) as MediaStream | undefined;
    // A stopped encoder leaves the track live and silent, so the element would
    // otherwise hold its last decoded frame indefinitely — a still picture that
    // reads as running video. Detaching is what makes "off" look off.
    const off = video.enabled(props.stream) === false;
    element.srcObject = off ? null : (media ?? null);
  });

  createEffect(() => {
    // Muted is what makes autoplay allowed without a user gesture, and it has to
    // be set as a *property*: the `muted` content attribute only seeds
    // `defaultMuted`, which does nothing for an element created after parse.
    element.muted = props.muted ?? true;
  });

  // `playsinline` is belt-and-suspenders for the desktop-only target. Both it
  // and `autoplay` stay overridable through `rest`.
  return (
    <video
      ref={element}
      autoplay
      playsinline
      {...rest}
      class={mergeClass('td-video', props.class)}
    />
  );
}
