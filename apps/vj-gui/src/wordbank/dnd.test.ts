import { describe, expect, it } from 'vitest';
import {
  PHRASE_MIME,
  TAB_MIME,
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

describe('hasPhraseDragData', () => {
  it('is false for a tab drag, so the two surfaces never cross-accept', () => {
    const dt = dataTransfer();
    dt.setData(TAB_MIME, '0');

    expect(hasPhraseDragData(dt)).toBe(false);
  });

  it('is true once the phrase mime is set', () => {
    const dt = dataTransfer();
    dt.setData(PHRASE_MIME, '{}');

    expect(hasPhraseDragData(dt)).toBe(true);
  });
});
