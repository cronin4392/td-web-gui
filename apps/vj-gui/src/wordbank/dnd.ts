/**
 * Native HTML5 drag-and-drop payload helpers (TEXT_SELECTOR.md §4).
 *
 * Every phrase drag sets both `text/plain` (interop/debuggability) and a
 * custom mime carrying structured origin info. Drop targets key off the
 * custom mime, not `text/plain`, so a drag originating outside the app (a
 * browser selection, another window) is never accepted.
 *
 * The mime check and the reorder index maths this builds on are in
 * `@/ui/dnd` — the scene picker drags too, and they belong to neither.
 */

import { hasDragMime } from '@/ui/dnd';

export const PHRASE_MIME = 'application/x-td-phrase';
/** Tab-strip reordering is a separate drag surface from phrase reordering (TEXT_SELECTOR.md §3). */
export const TAB_MIME = 'application/x-td-tab-index';

export interface PhraseDragPayload {
  phrase: string;
  source: 'list' | 'recent';
  /** Originating tab id, or `null` for a recent-list drag. */
  tabId: string | null;
  /** Originating index within that tab's phrase list, or `null` for recent. */
  index: number | null;
}

export function setPhraseDragData(dataTransfer: DataTransfer, payload: PhraseDragPayload): void {
  dataTransfer.setData('text/plain', payload.phrase);
  dataTransfer.setData(PHRASE_MIME, JSON.stringify(payload));
}

/** Returns `null` if the drag doesn't carry the app's custom mime (i.e. came from outside). */
export function readPhraseDragData(dataTransfer: DataTransfer): PhraseDragPayload | null {
  const raw = dataTransfer.getData(PHRASE_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.phrase === 'string') return parsed as PhraseDragPayload;
  } catch {
    // fall through
  }
  return null;
}

/** Whether an in-flight drag carries the app's phrase mime. */
export function hasPhraseDragData(dataTransfer: DataTransfer): boolean {
  return hasDragMime(dataTransfer, PHRASE_MIME);
}
