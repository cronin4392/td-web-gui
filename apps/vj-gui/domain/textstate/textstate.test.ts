import { describe, expect, it } from 'vitest';
import {
  actTextList,
  defaultTextState,
  isTextState,
  layerTextList,
  namedValues,
  type ShowInfo,
  type ShowRow,
} from './textstate';

function artist(text: string, on = true): ShowRow {
  return { id: crypto.randomUUID(), alias: 'artist', text, on };
}

function show(opts: {
  texts?: Record<string, string>;
  off?: string[];
  artists?: ShowRow[];
}): ShowInfo {
  const base = defaultTextState().show;
  const rows = base.rows.map((r) => ({
    ...r,
    text: opts.texts?.[r.alias ?? ''] ?? '',
    on: !opts.off?.includes(r.alias ?? ''),
  }));
  if (opts.artists) rows.splice(0, 1, ...opts.artists);
  return { rows };
}

const texts = { event: 'Elements', city: 'Boston', venue: 'Phoenix\\nLanding' };

describe('actTextList', () => {
  it('builds the list from the default rows', () => {
    const s = show({ texts, artists: [artist('Variable')] });
    expect(actTextList(s)).toEqual(['Variable', 'Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('lists a b2b as two artist rows, in row order', () => {
    const s = show({
      texts,
      off: ['venue'],
      artists: [artist('Variable'), artist('Audio Fields')],
    });
    expect(actTextList(s)).toEqual(['Variable', 'Audio Fields', 'Elements', 'Boston']);
  });

  it('skips an artist row switched off between two on ones', () => {
    const s = show({
      texts,
      off: ['venue'],
      artists: [artist('Variable'), artist('Skipped', false), artist('Audio Fields')],
    });
    expect(actTextList(s)).toEqual(['Variable', 'Audio Fields', 'Elements', 'Boston']);
  });

  it('moves the event to slot 1 with no artist on', () => {
    const s = show({ texts, artists: [artist('Variable', false)] });
    expect(actTextList(s)).toEqual(['Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('skips an on artist row left blank', () => {
    const s = show({ texts, artists: [artist(' '), artist('Variable')] });
    expect(actTextList(s)).toEqual(['Variable', 'Elements', 'Boston', 'Phoenix\\nLanding']);
  });

  it('takes the text of an artist row like any other row', () => {
    const s = show({ texts: { artist: 'Variable' } });
    expect(actTextList(s)).toEqual(['Variable']);
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

  it('uses the first artist row that is on and filled in', () => {
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

  it('is the overrides alone once any slot is overridden', () => {
    expect(layerTextList(act, ['X'])).toEqual(['X']);
  });

  it('sends a blank slot between overrides as empty', () => {
    expect(layerTextList(act, ['', 'X', '', 'Z'])).toEqual(['', 'X', '', 'Z']);
  });

  it('blanks a space-only slot between overrides', () => {
    expect(layerTextList(act, ['X', '  ', 'Z'])).toEqual(['X', '', 'Z']);
  });

  it('drops blank overrides after the last one', () => {
    expect(layerTextList(act, ['X', 'Y', ' ', ''])).toEqual(['X', 'Y']);
  });

  it('returns the act when every override is blank', () => {
    expect(layerTextList(act, ['', '  '])).toEqual(act);
  });

  it('returns the act for empty overrides', () => {
    expect(layerTextList(act, [])).toEqual(act);
  });
});

describe('defaultTextState', () => {
  it('has four on rows in order with unique ids', () => {
    const d = defaultTextState();
    expect(d.show.rows.map((r) => r.alias)).toEqual(['artist', 'event', 'city', 'venue']);
    expect(d.show.rows.every((r) => r.on && r.text === '')).toBe(true);
    expect(new Set(d.show.rows.map((r) => r.id)).size).toBe(4);
    expect(d.overrides).toEqual({});
  });
});

describe('isTextState', () => {
  it('accepts the default text state', () => {
    expect(isTextState(defaultTextState())).toBe(true);
  });

  it('rejects a bad alias', () => {
    const d = defaultTextState();
    (d.show.rows[0] as { alias: string }).alias = 'bogus';
    expect(isTextState(d)).toBe(false);
  });

  it('rejects a missing field', () => {
    const d = defaultTextState();
    delete (d.show.rows[0] as Partial<(typeof d.show.rows)[0]>).on;
    expect(isTextState(d)).toBe(false);
  });

  it('rejects a non-array override', () => {
    const d = { ...defaultTextState(), overrides: { l1: 'nope' } };
    expect(isTextState(d)).toBe(false);
  });

  it('rejects a text state that still carries an artist roster', () => {
    const d = { ...defaultTextState(), show: { rows: [], artists: [] } };
    expect(isTextState(d)).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isTextState(null)).toBe(false);
    expect(isTextState('x')).toBe(false);
  });
});
