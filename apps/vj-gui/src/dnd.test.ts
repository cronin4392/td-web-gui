import { describe, expect, it } from 'vitest';
import {
  PHRASE_MIME,
  TAB_MIME,
  adjustReorderTarget,
  dropIndexForRow,
  hasDragMime,
  hasPhraseDragData,
  readPhraseDragData,
  setPhraseDragData,
  type PhraseDragPayload,
} from './dnd';

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

describe('setPhraseDragData / readPhraseDragData', () => {
  it('round-trips a payload through both mimes', () => {
    const dt = dataTransfer();
    const payload: PhraseDragPayload = {
      phrase: 'hello',
      source: 'list',
      tabId: 'tab-a',
      index: 2,
    };

    setPhraseDragData(dt, payload);

    expect(dt.getData('text/plain')).toBe('hello');
    expect(readPhraseDragData(dt)).toEqual(payload);
  });

  it('returns null when the custom mime is absent (drag from outside the app)', () => {
    const dt = dataTransfer();
    dt.setData('text/plain', 'some browser selection');

    expect(readPhraseDragData(dt)).toBeNull();
  });

  it('returns null for malformed JSON on the custom mime', () => {
    const dt = dataTransfer();
    dt.setData(PHRASE_MIME, '{not json');

    expect(readPhraseDragData(dt)).toBeNull();
  });

  it('returns null when the parsed payload has no phrase string', () => {
    const dt = dataTransfer();
    dt.setData(PHRASE_MIME, JSON.stringify({ source: 'list', tabId: null, index: null }));

    expect(readPhraseDragData(dt)).toBeNull();
  });
});

describe('hasDragMime / hasPhraseDragData', () => {
  it('detects a mime present on the in-flight drag', () => {
    const dt = dataTransfer();
    dt.setData(TAB_MIME, '0');

    expect(hasDragMime(dt, TAB_MIME)).toBe(true);
    expect(hasDragMime(dt, PHRASE_MIME)).toBe(false);
    expect(hasPhraseDragData(dt)).toBe(false);
  });

  it('hasPhraseDragData is true once the phrase mime is set', () => {
    const dt = dataTransfer();
    dt.setData(PHRASE_MIME, '{}');

    expect(hasPhraseDragData(dt)).toBe(true);
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
