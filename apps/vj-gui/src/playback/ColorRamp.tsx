import type { JSX } from 'solid-js';
import { Ramp } from '@/ui/Ramp';
import { GuiClient } from './clients';

/**
 * The GUI project's color ramp, mirrored from its Ramp TOP. Read-only — every
 * name is flagged `writable: False` in `td/gui-config.py`.
 *
 * Five bindings rather than one: a Ramp TOP is a DAT of keyframes plus a
 * handful of parameters, and both are things the wire already carries — see
 * `RampParams` in ./wire. Must render inside `GuiProvider`.
 */
export function ColorRamp(): JSX.Element {
  const keys = GuiClient.signal('rampKeys');
  const type = GuiClient.signal('rampType');
  const interp = GuiClient.signal('rampInterp');
  const phase = GuiClient.signal('rampPhase');
  const period = GuiClient.signal('rampPeriod');
  return (
    <Ramp
      label="Color ramp"
      keys={keys.value()}
      type={type.value()}
      interp={interp.value()}
      phase={phase.value()}
      period={period.value()}
    />
  );
}
