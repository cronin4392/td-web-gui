import { render } from 'solid-js/web';
import { App } from './App';
import { fetchWordbank } from './wordbank/wordbank-api';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Hydrated before mount so store construction stays synchronous — no
// component sees a pre-hydration flash, and nothing can mutate the store
// during the gap. `fetchWordbank()` never rejects; it falls back to a
// default wordbank on failure. An async IIFE rather than top-level await —
// Vite's default build target predates top-level-await support.
void (async () => {
  const wordbank = await fetchWordbank();
  render(() => <App wordbank={wordbank} />, root);
})();
