/**
 * The parts of native HTML5 drag-and-drop that no feature owns: deciding whether
 * an in-flight drag is ours, and turning a pointer position into a list index.
 *
 * Payload shapes stay with the feature that drags them — a phrase in
 * `wordbank/dnd.ts`, a scene in `catalog/dnd.ts`. What lives here is only what
 * both would otherwise have written twice.
 */

/** Whether an in-flight drag carries the given custom mime — checked in
 * `dragover` to accept/reject before drop (payload data itself isn't readable
 * until drop). Keying drop targets off a custom mime rather than `text/plain` is
 * what keeps a drag from outside the app — a browser selection, another
 * window — from ever being accepted. */
export function hasDragMime(dataTransfer: DataTransfer, mime: string): boolean {
  return dataTransfer.types.includes(mime);
}

/**
 * Reorder insertion index from a pointer position against a row's vertical
 * midpoint: above the midpoint inserts before the row, below inserts after.
 */
export function dropIndexForRow(event: DragEvent, rowEl: Element, rowIndex: number): number {
  const rect = rowEl.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  return event.clientY < midpoint ? rowIndex : rowIndex + 1;
}

/**
 * Convert a "drop at index `to` in the pre-drag array" target into the
 * splice-target index a store's move (splice-out then splice-in) needs:
 * removing the source item shifts everything after it left by one, so an
 * intended target past the source must shift left by one to compensate.
 */
export function adjustReorderTarget(from: number, to: number): number {
  return from < to ? to - 1 : to;
}

/** Applies a reorder as one immutable splice-out then splice-in. Out of range in
 * either index leaves the list alone rather than dropping an item. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1) as [T];
  next.splice(to, 0, moved);
  return next;
}
