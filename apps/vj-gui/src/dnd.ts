/**
 * Native HTML5 drag-and-drop payload helpers (TEXT_SELECTOR.md §4).
 *
 * Every phrase drag sets both `text/plain` (interop/debuggability) and a
 * custom mime carrying structured origin info. Drop targets key off the
 * custom mime, not `text/plain`, so a drag originating outside the app (a
 * browser selection, another window) is never accepted.
 */

export const PHRASE_MIME = 'application/x-td-phrase'
/** Tab-strip reordering is a separate drag surface from phrase reordering (TEXT_SELECTOR.md §3). */
export const TAB_MIME = 'application/x-td-tab-index'

export interface PhraseDragPayload {
  phrase: string
  source: 'list' | 'recent'
  /** Originating tab id, or `null` for a recent-list drag. */
  tabId: string | null
  /** Originating index within that tab's phrase list, or `null` for recent. */
  index: number | null
}

export function setPhraseDragData(dataTransfer: DataTransfer, payload: PhraseDragPayload): void {
  dataTransfer.setData('text/plain', payload.phrase)
  dataTransfer.setData(PHRASE_MIME, JSON.stringify(payload))
}

/** Returns `null` if the drag doesn't carry the app's custom mime (i.e. came from outside). */
export function readPhraseDragData(dataTransfer: DataTransfer): PhraseDragPayload | null {
  const raw = dataTransfer.getData(PHRASE_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.phrase === 'string') return parsed as PhraseDragPayload
  } catch {
    // fall through
  }
  return null
}

/** Whether an in-flight drag carries the given custom mime — checked in `dragover` to accept/reject before drop (payload data itself isn't readable until drop). */
export function hasDragMime(dataTransfer: DataTransfer, mime: string): boolean {
  return dataTransfer.types.includes(mime)
}

/** Whether an in-flight drag carries the app's phrase mime. */
export function hasPhraseDragData(dataTransfer: DataTransfer): boolean {
  return hasDragMime(dataTransfer, PHRASE_MIME)
}

/**
 * Reorder insertion index from a pointer position against a row's vertical
 * midpoint: above the midpoint inserts before the row, below inserts after.
 */
export function dropIndexForRow(event: DragEvent, rowEl: Element, rowIndex: number): number {
  const rect = rowEl.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2
  return event.clientY < midpoint ? rowIndex : rowIndex + 1
}

/**
 * Convert a "drop at index `to` in the pre-drag array" target into the
 * splice-target index a store's move (splice-out then splice-in) needs:
 * removing the source item shifts everything after it left by one, so an
 * intended target past the source must shift left by one to compensate.
 */
export function adjustReorderTarget(from: number, to: number): number {
  return from < to ? to - 1 : to
}
