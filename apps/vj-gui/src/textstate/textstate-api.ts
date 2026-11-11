import { defaultShowDocument, isShowDocument, type ShowDocument } from '@domain/showinfo/showinfo';

const ENDPOINT = '/api/showinfo';

export async function fetchShowDocument(): Promise<ShowDocument> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`GET ${ENDPOINT} -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isShowDocument(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn('[vj-gui] failed to load show info from server, starting with defaults', err);
    return defaultShowDocument();
  }
}

export async function saveShowDocument(doc: ShowDocument): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
    // Lets the save fired from `pagehide` outlive the page.
    keepalive: true,
  });
  if (!res.ok) throw new Error(`PUT ${ENDPOINT} -> ${res.status}`);
}
