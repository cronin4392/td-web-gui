import { For, type JSX } from 'solid-js';
import { RadioButton } from '@/ui/RadioButton';
import { GuiClient } from './clients';
import { BEAT_PERIODS } from './wire';
import styles from './BeatPeriod.module.css';

export function BeatPeriod(): JSX.Element {
  const period = GuiClient.signal('beatPeriod');
  return (
    <fieldset class={styles.periods} aria-label="Beat period">
      <For each={BEAT_PERIODS}>
        {(beats, index) => (
          <RadioButton
            name="beat-period"
            checked={period.value() === index()}
            onSelect={() => period.setValue(index())}
          >
            {beats}
          </RadioButton>
        )}
      </For>
    </fieldset>
  );
}
