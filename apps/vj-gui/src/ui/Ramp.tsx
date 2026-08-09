import type { JSX } from 'solid-js';
import { rampGradient, type RampSource } from './gradient';
import styles from './Ramp.module.css';

export interface RampProps extends RampSource {
  /** Describes what this ramp belongs to, e.g. `Layer A color ramp`. */
  label: string;
}

/**
 * A Ramp TOP's gradient, mirrored from TouchDesigner. Read-only: every field is
 * a param or readout TD drives, and nothing here writes back.
 *
 * Before the first snapshot lands — and for a Ramp TOP whose DAT holds no usable
 * rows — it renders as an empty bar rather than disappearing, so a layer's row
 * of controls doesn't reflow when TD connects.
 */
export function Ramp(props: RampProps): JSX.Element {
  const gradient = () => rampGradient(props);
  return (
    <div
      class={styles.ramp}
      role="img"
      aria-label={props.label}
      style={{ 'background-image': gradient() }}
    />
  );
}
