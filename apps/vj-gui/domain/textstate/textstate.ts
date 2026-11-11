export const aliases = ['artist', 'event', 'venue', 'city'] as const;

export type Alias = (typeof aliases)[number];

export interface ShowRow {
  id: string;
  alias: Alias | null;
  text: string;
  on: boolean;
}

export interface ShowInfo {
  rows: ShowRow[];
}

export type NamedValues = Record<Alias, string>;

/** Each Layer's overrides by slot, keyed by layer id; `''` means "use the act text list". */
export type LayerOverrides = Record<string, string[]>;

export interface TextState {
  show: ShowInfo;
  overrides: LayerOverrides;
}

export function isBlank(text: string): boolean {
  return text.trim() === '';
}

function shows(row: ShowRow): boolean {
  return row.on && !isBlank(row.text);
}

export function actTextList(show: ShowInfo): string[] {
  return show.rows.filter(shows).map((r) => r.text);
}

export function namedValues(show: ShowInfo): NamedValues {
  const named: NamedValues = { artist: '', event: '', venue: '', city: '' };
  const seen = new Set<Alias>();
  for (const row of show.rows) {
    if (!shows(row) || row.alias === null || seen.has(row.alias)) continue;
    named[row.alias] = row.text;
    seen.add(row.alias);
  }
  return named;
}

export function layerTextList(act: string[], overrides: string[]): string[] {
  const length = Math.max(act.length, overrides.findLastIndex((text) => !isBlank(text)) + 1);
  return Array.from({ length }, (_, i) => {
    const override = overrides[i];
    return override !== undefined && !isBlank(override) ? override : (act[i] ?? '');
  });
}

export function defaultTextState(): TextState {
  const order: Alias[] = ['artist', 'event', 'city', 'venue'];
  return {
    show: {
      rows: order.map((alias) => ({ id: crypto.randomUUID(), alias, text: '', on: true })),
    },
    overrides: {},
  };
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isShowRow(x: unknown): x is ShowRow {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  const aliasOk =
    r.alias === null ||
    (typeof r.alias === 'string' && (aliases as readonly string[]).includes(r.alias));
  return (
    typeof r.id === 'string' && aliasOk && typeof r.text === 'string' && typeof r.on === 'boolean'
  );
}

export function isTextState(x: unknown): x is TextState {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  const show = d.show as Record<string, unknown> | null | undefined;
  if (typeof show !== 'object' || show === null) return false;
  if (!Array.isArray(show.rows) || !show.rows.every(isShowRow)) return false;
  // A page still running the artist-roster code would save its artists' slot as an empty row.
  if ('artists' in show) return false;
  const o = d.overrides;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  return Object.values(o).every(isStringArray);
}
