import { describe, expect, it } from 'vitest';
import { adjustReorderTarget, dropIndexForRow, hasDragMime, moveItem } from './dnd';

const A_MIME = 'application/x-td-a';
const B_MIME = 'application/x-td-b';

class FakeDataTransfer {
  private data = new Map<string, string>();
  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(format: string, value: string): void {
    this.data.set(format, value);
  }
  getData(format: string): string {
    return this.data.get(format) ?? '';
  }
}

function dataTransfer(): DataTransfer {
  return new FakeDataTransfer() as unknown as DataTransfer;
}

describe('hasDragMime', () => {
  it('detects a mime present on the in-flight drag, and only that one', () => {
    const dt = dataTransfer();
    dt.setData(A_MIME, '0');

    expect(hasDragMime(dt, A_MIME)).toBe(true);
    expect(hasDragMime(dt, B_MIME)).toBe(false);
  });

  it('rejects a drag from outside the app', () => {
    const dt = dataTransfer();
    dt.setData('text/plain', 'some browser selection');

    expect(hasDragMime(dt, A_MIME)).toBe(false);
  });
});

describe('dropIndexForRow', () => {
  function row(top: number, height: number): Element {
    return {
      getBoundingClientRect: () => ({ top, height }) as DOMRect,
    } as unknown as Element;
  }

  it('inserts before the row when the pointer is above the midpoint', () => {
    const event = { clientY: 9 } as DragEvent;
    expect(dropIndexForRow(event, row(0, 20), 3)).toBe(3);
  });

  it('inserts after the row when the pointer is below the midpoint', () => {
    const event = { clientY: 11 } as DragEvent;
    expect(dropIndexForRow(event, row(0, 20), 3)).toBe(4);
  });

  it('treats the exact midpoint as below (insert after)', () => {
    const event = { clientY: 10 } as DragEvent;
    expect(dropIndexForRow(event, row(0, 20), 3)).toBe(4);
  });
});

describe('adjustReorderTarget', () => {
  it('shifts the target left by one when the source is before it', () => {
    expect(adjustReorderTarget(1, 4)).toBe(3);
  });

  it('leaves the target unchanged when the source is after it', () => {
    expect(adjustReorderTarget(4, 1)).toBe(1);
  });

  it('leaves the target unchanged when source equals target', () => {
    expect(adjustReorderTarget(2, 2)).toBe(2);
  });
});

describe('moveItem', () => {
  it('moves an item forward and backward without dropping any', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('leaves the list alone when an index is out of range', () => {
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const items = ['a', 'b', 'c'];
    moveItem(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
