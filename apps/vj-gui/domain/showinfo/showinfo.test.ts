import { describe, expect, it } from 'vitest';
import {
  actTextList,
  defaultShowDocument,
  isShowDocument,
  layerTextList,
  namedValues,
  type Artist,
  type ShowInfo,
} from './showinfo';

function artist(name: string, active = true): Artist {
  return { id: crypto.randomUUID(), name, active };
}

function show(opts: {
  texts?: Record<string, string>;
  off?: string[];
  artists?: Artist[];
}): ShowInfo {
  const base = defaultShowDocument().show;
  return {
    rows: base.rows.map((r) => ({
      ...r,
      text: opts.texts?.[r.alias ?? ''] ?? '',
      on: !opts.off?.includes(r.alias ?? ''),
    })),
    artists: opts.artists ?? [],
  };
}

const texts = { event: 'Elements', city: 'Boston', venue: 'Phoenix\\nLanding' };

describe('actTextList', () => {
  it('builds the list from the default rows', () => {
    const s = show({ texts, artists: [artist('Variable')] });
    expect(actTextList(s)).toEqual(['Variable', 'Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('expands a b2b in roster order', () => {
    const s = show({
      texts,
      off: ['venue'],
      artists: [artist('Variable'), artist('Audio Fields')],
    });
    expect(actTextList(s)).toEqual(['Variable', 'Audio Fields', 'Elements', 'Boston']);
  });

  it('ignores an inactive artist between two active ones', () => {
    const s = show({
      texts,
      off: ['venue'],
      artists: [artist('Variable'), artist('Skipped', false), artist('Audio Fields')],
    });
    expect(actTextList(s)).toEqual(['Variable', 'Audio Fields', 'Elements', 'Boston']);
  });

  it('moves the event to slot 1 with no active artists', () => {
    const s = show({ texts, artists: [artist('Variable', false)] });
    expect(actTextList(s)).toEqual(['Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('skips an active artist with a blank name', () => {
    const s = show({ texts, artists: [artist(' '), artist('Variable')] });
    expect(actTextList(s)).toEqual(['Variable', 'Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('adds nothing for a space-only row', () => {
    const s = show({ texts: { ...texts, event: '   ' } });
    expect(actTextList(s)).toEqual(['Boston', 'Phoenix\\nLanding']);
  });

  it('ignores typed text on artist rows', () => {
    const s = show({ texts: { artist: 'typed' } });
    expect(actTextList(s)).toEqual([]);
  });

  it('lets repeated aliases both contribute', () => {
    const s = show({ texts: { event: 'One' } });
    s.rows.push({ id: 'x', alias: 'event', text: 'Two', on: true });
    expect(actTextList(s)).toEqual(['One', 'Two']);
  });

  it('keeps case and surrounding spaces as typed', () => {
    const s = show({ texts: { event: ' Mixed Case ' } });
    expect(actTextList(s)).toEqual([' Mixed Case ']);
  });
});

describe('namedValues', () => {
  it('returns every key, blank when nothing contributes', () => {
    expect(namedValues(show({}))).toEqual({ artist: '', event: '', venue: '', city: '' });
  });

  it('is blank when the only row with the alias is off', () => {
    expect(namedValues(show({ texts, off: ['city'] })).city).toBe('');
  });

  it('uses the first active artist', () => {
    const s = show({ artists: [artist('Gone', false), artist('Variable'), artist('Other')] });
    expect(namedValues(s).artist).toBe('Variable');
  });

  it('takes the first of repeated aliases', () => {
    const s = show({ texts: { event: 'One' } });
    s.rows.push({ id: 'x', alias: 'event', text: 'Two', on: true });
    expect(namedValues(s).event).toBe('One');
  });

  it('skips a blank earlier row for a later non-blank one', () => {
    const s = show({ texts: { event: '' } });
    s.rows.push({ id: 'x', alias: 'event', text: 'Two', on: true });
    expect(namedValues(s).event).toBe('Two');
  });
});

describe('layerTextList', () => {
  const act = ['a', 'b', 'c'];

  it('replaces only the overridden slot', () => {
    expect(layerTextList(act, ['', 'X'])).toEqual(['a', 'X', 'c']);
  });

  it('falls back on a space-only override', () => {
    expect(layerTextList(act, ['  '])).toEqual(act);
  });

  it('drops overrides past the end of the act', () => {
    expect(layerTextList(act, ['', '', '', 'Z'])).toEqual(act);
  });

  it('returns the act for empty overrides', () => {
    expect(layerTextList(act, [])).toEqual(act);
  });
});

describe('defaultShowDocument', () => {
  it('has four on rows in order with unique ids', () => {
    const d = defaultShowDocument();
    expect(d.show.rows.map((r) => r.alias)).toEqual(['artist', 'event', 'city', 'venue']);
    expect(d.show.rows.every((r) => r.on && r.text === '')).toBe(true);
    expect(new Set(d.show.rows.map((r) => r.id)).size).toBe(4);
    expect(d.show.artists).toEqual([]);
    expect(d.overrides).toEqual({});
  });
});

describe('isShowDocument', () => {
  it('accepts the default document', () => {
    expect(isShowDocument(defaultShowDocument())).toBe(true);
  });

  it('rejects a bad alias', () => {
    const d = defaultShowDocument();
    (d.show.rows[0] as { alias: string }).alias = 'bogus';
    expect(isShowDocument(d)).toBe(false);
  });

  it('rejects a missing field', () => {
    const d = defaultShowDocument();
    delete (d.show.rows[0] as Partial<(typeof d.show.rows)[0]>).on;
    expect(isShowDocument(d)).toBe(false);
  });

  it('rejects a non-array override', () => {
    const d = { ...defaultShowDocument(), overrides: { l1: 'nope' } };
    expect(isShowDocument(d)).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isShowDocument(null)).toBe(false);
    expect(isShowDocument('x')).toBe(false);
  });
});
