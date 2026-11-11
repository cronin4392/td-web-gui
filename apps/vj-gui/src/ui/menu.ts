export interface MenuAction {
  label: string;
  onSelect: () => void;
  /** Present at all — `true` or `false` — makes this a checkbox item. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export type MenuItems = readonly (MenuAction | 'separator')[];

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function menuPosition(cursor: Point, menu: Box, viewport: Box): Point {
  return {
    x: alongAxis(cursor.x, menu.width, viewport.width),
    y: alongAxis(cursor.y, menu.height, viewport.height),
  };
}

function alongAxis(at: number, size: number, extent: number): number {
  if (at + size <= extent) return at;
  if (at - size >= 0) return at - size;
  return Math.max(0, extent - size);
}
