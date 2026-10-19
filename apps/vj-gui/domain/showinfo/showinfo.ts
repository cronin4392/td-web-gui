export const aliases = ['artist', 'event', 'venue', 'city'] as const;

export type Alias = (typeof aliases)[number];

export interface ShowRow {
  id: string;
  alias: Alias | null;
  text: string;
  on: boolean;
}

export interface Artist {
  id: string;
  name: string;
  active: boolean;
}

export interface ShowInfo {
  rows: ShowRow[];
  artists: Artist[];
}

export type NamedValues = Record<Alias, string>;

/** Each Layer's overrides by slot, keyed by layer id; `''` means "use the act text list". */
export type LayerOverrides = Record<string, string[]>;

export interface ShowDocument {
  show: ShowInfo;
  overrides: LayerOverrides;
}

export function isBlank(text: string): boolean {
  return text.trim() === '';
}

function rowValues(row: ShowRow, show: ShowInfo): string[] {
  const active = show.artists.filter((a) => a.active);
  const values = row.alias === 'artist' ? active.map((a) => a.name) : [row.text];
  return values.filter((v) => !isBlank(v));
}

export function actTextList(show: ShowInfo): string[] {
  return show.rows.filter((r) => r.on).flatMap((r) => rowValues(r, show));
}

export function namedValues(show: ShowInfo): NamedValues {
  const named: NamedValues = { artist: '', event: '', venue: '', city: '' };
  const seen = new Set<Alias>();
  for (const row of show.rows) {
    if (!row.on || row.alias === null || seen.has(row.alias)) continue;
    const [first] = rowValues(row, show);
    if (first === undefined) continue;
    named[row.alias] = first;
    seen.add(row.alias);
  }
  return named;
}

export function layerTextList(act: string[], overrides: string[]): string[] {
  return act.map((text, i) => {
    const override = overrides[i];
    return override !== undefined && !isBlank(override) ? override : text;
  });
}

export function trimOverrides(overrides: LayerOverrides, length: number): LayerOverrides {
  const trimmed: LayerOverrides = {};
  for (const [layer, texts] of Object.entries(overrides)) {
    const kept = texts.slice(0, length);
    if (kept.some((text) => !isBlank(text))) trimmed[layer] = kept;
  }
  return trimmed;
}

export function defaultShowDocument(): ShowDocument {
  const order: Alias[] = ['artist', 'event', 'city', 'venue'];
  return {
    show: {
      rows: order.map((alias) => ({ id: crypto.randomUUID(), alias, text: '', on: true })),
      artists: [],
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

function isArtist(x: unknown): x is Artist {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  return typeof a.id === 'string' && typeof a.name === 'string' && typeof a.active === 'boolean';
}

export function isShowDocument(x: unknown): x is ShowDocument {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  const show = d.show as Record<string, unknown> | null | undefined;
  if (typeof show !== 'object' || show === null) return false;
  if (!Array.isArray(show.rows) || !show.rows.every(isShowRow)) return false;
  if (!Array.isArray(show.artists) || !show.artists.every(isArtist)) return false;
  const o = d.overrides;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  return Object.values(o).every(isStringArray);
}
