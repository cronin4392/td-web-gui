import { defaultTextState, isTextState, type TextState } from '@domain/textstate/textstate';

const ENDPOINT = '/api/textstate';

export async function fetchTextState(): Promise<TextState> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isTextState(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn('[vj-gui] failed to load text state from server, starting with defaults', err);
    return defaultTextState();
  }
}

export async function saveTextState(state: TextState): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
    // Lets the save fired from `pagehide` outlive the page.
    keepalive: true,
  });
  if (!res.ok) throw new Error(`PUT ${ENDPOINT} -> ${res.status}`);
}
