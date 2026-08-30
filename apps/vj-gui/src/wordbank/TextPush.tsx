import type { JSX } from 'solid-js';
import { usePlayback } from '@/playback/PlaybackProvider';
import { createTextPush } from './createTextPush';
import { useWordbank } from './WordbankProvider';

/** Exists to own {@link createTextPush}'s effects under both providers. */
export function TextPush(): JSX.Element {
  createTextPush(useWordbank(), usePlayback().connections);
  return null;
}
