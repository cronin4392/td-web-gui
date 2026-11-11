import { describe, expect, it } from 'vitest';
import {
  TEXT_MIME,
  TAB_MIME,
  hasTextDragData,
  readTextDragData,
  setTextDragData,
  type TextDragPayload,
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

describe('setTextDragData / readTextDragData', () => {
  it('round-trips a payload through both mimes', () => {
    const dt = dataTransfer();
    const payload: TextDragPayload = {
      text: 'hello',
      source: 'list',
      listId: 'tab-a',
      index: 2,
    };

    setTextDragData(dt, payload);

    expect(dt.getData('text/plain')).toBe('hello');
    expect(readTextDragData(dt)).toEqual(payload);
  });

  it('returns null when the custom mime is absent (drag from outside the app)', () => {
    const dt = dataTransfer();
    dt.setData('text/plain', 'some browser selection');

    expect(readTextDragData(dt)).toBeNull();
  });

  it('returns null for malformed JSON on the custom mime', () => {
    const dt = dataTransfer();
    dt.setData(TEXT_MIME, '{not json');

    expect(readTextDragData(dt)).toBeNull();
  });

  it('returns null when the parsed payload has no text string', () => {
    const dt = dataTransfer();
    dt.setData(TEXT_MIME, JSON.stringify({ source: 'list', listId: null, index: null }));

    expect(readTextDragData(dt)).toBeNull();
  });
});

describe('hasTextDragData', () => {
  it('is false for a tab drag, so the two surfaces never cross-accept', () => {
    const dt = dataTransfer();
    dt.setData(TAB_MIME, '0');

    expect(hasTextDragData(dt)).toBe(false);
  });

  it('is true once the text mime is set', () => {
    const dt = dataTransfer();
    dt.setData(TEXT_MIME, '{}');

    expect(hasTextDragData(dt)).toBe(true);
  });
});
