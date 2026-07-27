import { render } from 'solid-js/web';
import { App } from './App';
import { fetchLibrary } from './library-api';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Hydrated before mount so store construction stays synchronous — no
// component sees a pre-hydration flash, and nothing can mutate the store
// during the gap. `fetchLibrary()` never rejects; it falls back to a
// default library on failure. An async IIFE rather than top-level await —
// Vite's default build target predates top-level-await support.
void (async () => {
  const library = await fetchLibrary();
  render(() => <App library={library} />, root);
})();
