import { describe, expect, it } from 'vitest';
import { escapeNewlines } from 'td-core';
import { textOverride } from './textOverride';

describe('textOverride', () => {
  it('is undefined for a param only carrying its Default', () => {
    expect(textOverride('SOME ARTIST', 'SOME ARTIST')).toBeUndefined();
  });

  it('is undefined for an empty param, Default or no Default', () => {
    expect(textOverride('', '')).toBeUndefined();
    expect(textOverride('', 'SOME ARTIST')).toBeUndefined();
  });

  it('returns the text when it differs from the Default', () => {
    expect(textOverride('GUEST SET', 'SOME ARTIST')).toBe('GUEST SET');
  });

  it('returns the text when there is no Default to match', () => {
    expect(textOverride('GUEST SET', '')).toBe('GUEST SET');
  });

  it('compares across the wire escaping, so a multi-line Default matches itself', () => {
    const value = 'SOME ARTIST\n& CREW';
    expect(textOverride(escapeNewlines(value), value)).toBeUndefined();
  });

  it('hands back real newlines, not the wire escape', () => {
    expect(textOverride(escapeNewlines('GUEST\nSET'), 'SOME ARTIST')).toBe('GUEST\nSET');
  });

  it('treats a Default that differs only by newline style as an override', () => {
    expect(textOverride('a\\nb', 'a b')).toBe('a\nb');
  });
});
