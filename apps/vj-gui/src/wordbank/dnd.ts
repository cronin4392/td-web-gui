/**
 * Native HTML5 drag-and-drop payload helpers (TEXT_SELECTOR.md §4).
 *
 * Every text drag sets both `text/plain` (interop/debuggability) and a
 * custom mime carrying structured origin info. Drop targets key off the
 * custom mime, not `text/plain`, so a drag originating outside the app (a
 * browser selection, another window) is never accepted.
 *
 * The mime check and the reorder index maths this builds on are in
 * `@/ui/dnd` — the scene picker drags too, and they belong to neither.
 */

import { hasDragMime } from '@/ui/dnd';

export const TEXT_MIME = 'application/x-td-text';
/** Tab-strip reordering is a separate drag surface from phrase reordering (TEXT_SELECTOR.md §3). */
export const TAB_MIME = 'application/x-td-tab-index';

export interface TextDragPayload {
  text: string;
  source: 'list' | 'recent' | 'show' | 'search';
  /** Originating tab id, or `null` for a recent, show or search drag. */
  tabId: string | null;
  /** Originating index within that tab's phrase list, or `null` for recent, show or search. */
  index: number | null;
}

export function setTextDragData(dataTransfer: DataTransfer, payload: TextDragPayload): void {
  dataTransfer.setData('text/plain', payload.text);
  dataTransfer.setData(TEXT_MIME, JSON.stringify(payload));
}

/** Returns `null` if the drag doesn't carry the app's custom mime (i.e. came from outside). */
export function readTextDragData(dataTransfer: DataTransfer): TextDragPayload | null {
  const raw = dataTransfer.getData(TEXT_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.text === 'string') return parsed as TextDragPayload;
  } catch {
    // fall through
  }
  return null;
}

/** Whether an in-flight drag carries the app's text mime. */
export function hasTextDragData(dataTransfer: DataTransfer): boolean {
  return hasDragMime(dataTransfer, TEXT_MIME);
}
