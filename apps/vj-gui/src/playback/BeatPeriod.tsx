import { For, type JSX } from 'solid-js';
import { RadioButton } from '@/ui/RadioButton';
import { RadioGroup } from '@/ui/RadioGroup';
import { GuiClient } from './clients';
import { BEAT_PERIODS } from './wire';
import styles from './BeatPeriod.module.css';

export function BeatPeriod(): JSX.Element {
  const period = GuiClient.signal('beatPeriod');
  return (
    <RadioGroup
      name="beat-period"
      direction="horizontal"
      label="Beat period"
      class={styles.periods}
    >
      <For each={BEAT_PERIODS}>
        {(beats, index) => (
          <RadioButton
            checked={period.value() === index()}
            onSelect={() => period.setValue(index())}
          >
            {beats}
          </RadioButton>
        )}
      </For>
    </RadioGroup>
  );
}
