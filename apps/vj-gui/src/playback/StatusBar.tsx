/**
 * The bar along the bottom, reading a different TouchDesigner process per item —
 * so each item carries its own `<Provider>` rather than the bar carrying one.
 * td-core binds against the *nearest* provider from a single shared context, so
 * a provider around the whole bar would capture every item inside it, and the
 * next item added here would silently read the wrong process.
 */

import type { JSX } from 'solid-js';
import { GuiProvider, InputProvider } from './clients';
import { BeatPeriod } from './BeatPeriod';
import { BpmReadout } from './BpmReadout';
import styles from './StatusBar.module.css';

export function StatusBar(): JSX.Element {
  return (
    <div class={styles.bar}>
      <InputProvider>
        <BpmReadout />
      </InputProvider>
      <GuiProvider>
        <BeatPeriod />
      </GuiProvider>
    </div>
  );
}
