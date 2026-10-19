// First import on purpose: a cascade layer's position is fixed by where it is
// first named, so the `@layer` statement in index.css has to reach the document
// ahead of any component's `@layer components` module.
import './index.css';
import { render } from 'solid-js/web';
import { App } from './App';
import { fetchWordbank } from './wordbank/wordbank-api';
import { fetchShowDocument } from './showinfo/showinfo-api';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// Hydrated before mount so store construction stays synchronous — no
// component sees a pre-hydration flash, and nothing can mutate the store
// during the gap. Neither fetch rejects; each falls back to a
// default on failure. An async IIFE rather than top-level await —
// Vite's default build target predates top-level-await support.
void (async () => {
  const [wordbank, showDocument] = await Promise.all([fetchWordbank(), fetchShowDocument()]);
  render(() => <App wordbank={wordbank} showDocument={showDocument} />, root);
})();
