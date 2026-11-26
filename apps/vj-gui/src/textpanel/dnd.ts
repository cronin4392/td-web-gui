import { hasDragMime } from '@/ui/dnd';

export const TEXT_MIME = 'application/x-td-text';
/** Tab-strip reordering is a separate drag surface from phrase reordering. */
export const TAB_MIME = 'application/x-td-tab-index';

export interface TextDragPayload {
  text: string;
  source: 'list' | 'recent' | 'show' | 'search';
  /** Originating Phrase list id, or `null` for a recent, show or search drag. */
  listId: string | null;
  /** Originating index within that Phrase list, or `null` for recent, show or search. */
  index: number | null;
}

export function setTextDragData(dataTransfer: DataTransfer, payload: TextDragPayload): void {
  // `text/plain` is for interop only: drop targets key off the custom mime, so an outside drag is never accepted.
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
