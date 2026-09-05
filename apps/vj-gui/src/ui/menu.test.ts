import { describe, expect, it } from 'vitest';
import { menuPosition } from './menu';

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };

describe('menuPosition', () => {
  it('opens at the cursor when the menu fits after it', () => {
    expect(menuPosition({ x: 100, y: 100 }, menu, viewport)).toEqual({ x: 100, y: 100 });
  });

  it('flips before the cursor on the axis that would overflow', () => {
    expect(menuPosition({ x: 950, y: 100 }, menu, viewport)).toEqual({ x: 750, y: 100 });
    expect(menuPosition({ x: 100, y: 700 }, menu, viewport)).toEqual({ x: 100, y: 400 });
  });

  it('flips both axes in the bottom-right corner', () => {
    expect(menuPosition({ x: 990, y: 790 }, menu, viewport)).toEqual({ x: 790, y: 490 });
  });

  it('pins to the far edge when the menu fits on neither side', () => {
    expect(menuPosition({ x: 30, y: 30 }, { width: 990, height: 795 }, viewport)).toEqual({
      x: 10,
      y: 5,
    });
  });

  it('clamps to the origin rather than going negative for an oversized menu', () => {
    expect(menuPosition({ x: 400, y: 400 }, { width: 1200, height: 900 }, viewport)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
