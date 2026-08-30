import { describe, expect, it } from 'vitest';
import {
  defaultWordbank,
  isWordbank,
  resolveLayerText,
  type TextField,
  type Wordbank,
} from './wordbank';

const fields: TextField[] = [
  { id: 'f1', defaultValue: 'SOME ARTIST' },
  { id: 'f2', defaultValue: '' },
];

describe('resolveLayerText', () => {
  it("prefers a Layer's override over the Default", () => {
    expect(resolveLayerText(fields, { A: { f1: 'GUEST SET' } }, 'A')).toEqual(['GUEST SET', '']);
  });

  it('falls back to the Default for a blank override', () => {
    expect(resolveLayerText(fields, { A: { f1: '' } }, 'A')).toEqual(['SOME ARTIST', '']);
  });

  it('gives an unknown layer every Default', () => {
    expect(resolveLayerText(fields, { A: { f1: 'GUEST SET' } }, 'B')).toEqual(['SOME ARTIST', '']);
  });

  it('leaves a field with neither override nor Default empty', () => {
    expect(resolveLayerText(fields, {}, 'A')[1]).toBe('');
  });

  it('answers in field order, one line per field', () => {
    const three = [...fields, { id: 'f3', defaultValue: 'VENUE' }];
    expect(resolveLayerText(three, { A: { f3: 'WAREHOUSE' } }, 'A')).toEqual([
      'SOME ARTIST',
      '',
      'WAREHOUSE',
    ]);
  });
});

describe('isWordbank', () => {
  const valid: Wordbank = {
    fields,
    overrides: {},
    lists: [{ id: 'l1', name: 'List 1', phrases: [] }],
    recent: [],
  };

  it('accepts the default wordbank', () => {
    expect(isWordbank(defaultWordbank())).toBe(true);
  });

  it('accepts an empty overrides map', () => {
    expect(isWordbank(valid)).toBe(true);
  });

  it('accepts a populated overrides map', () => {
    expect(isWordbank({ ...valid, overrides: { A: { f1: 'GUEST SET' }, Z1: {} } })).toBe(true);
  });

  it('rejects a missing overrides key', () => {
    const { overrides: _, ...without } = valid;
    expect(isWordbank(without)).toBe(false);
  });

  it('rejects a non-string override leaf', () => {
    expect(isWordbank({ ...valid, overrides: { A: { f1: 3 } } })).toBe(false);
  });

  it('rejects an override entry that is not a record', () => {
    expect(isWordbank({ ...valid, overrides: { A: 'GUEST SET' } })).toBe(false);
    expect(isWordbank({ ...valid, overrides: { A: ['GUEST SET'] } })).toBe(false);
  });

  it('rejects fewer fields than the minimum', () => {
    expect(isWordbank({ ...valid, fields: [fields[0]] })).toBe(false);
  });
});
