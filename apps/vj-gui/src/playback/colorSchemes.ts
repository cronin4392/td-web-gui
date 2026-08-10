/**
 * The Color scheme catalog: what TouchDesigner's `colorSchemes` call returns,
 * and how to read it safely.
 *
 * A call's `value` is untyped JSON — unlike a param, nothing coerces it against
 * a registry entry — so it is parsed here rather than cast. The catalog is also
 * the one place the two sides' shapes are hand-matched: `td/gui-config.py`'s
 * `_color_schemes` builds exactly this, and nothing checks that it still does.
 */

/** One selectable Color scheme. */
export interface ColorScheme {
  name: string;
  /**
   * The scheme COMP's TouchDesigner path. Its identity here, and the value
   * `activeColorScheme` carries — picking a scheme writes this back.
   */
  path: string;
  /** The ramp TD sampled, as `[pos, r, g, b, a]` rows for `colorStopsGradient`. */
  stops: number[][];
}

/** One tab: a Color group and the schemes filed under it, in TD's own order. */
export interface ColorGroup {
  name: string;
  schemes: ColorScheme[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A row of five finite numbers, or nothing. Anything else isn't a stop. */
function parseStop(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length < 5) return undefined;
  const stop = value.slice(0, 5);
  if (!stop.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  return stop as number[];
}

function parseScheme(value: unknown): ColorScheme | undefined {
  if (!isRecord(value)) return undefined;
  const { name, path, stops } = value;
  if (typeof name !== 'string' || !name) return undefined;
  if (typeof path !== 'string' || !path) return undefined;
  const parsed = Array.isArray(stops) ? stops.map(parseStop).filter((s) => s !== undefined) : [];
  return { name, path, stops: parsed };
}

/**
 * The `colorSchemes` reply as groups, dropping anything malformed rather than
 * failing whole. A scheme with no usable stops is kept: it is still selectable,
 * and a swatch that renders empty says more than one that silently vanishes.
 * Groups with no schemes at all are dropped — an empty tab is only noise.
 */
export function parseColorGroups(value: unknown): ColorGroup[] {
  if (!isRecord(value) || !Array.isArray(value['groups'])) return [];
  const groups: ColorGroup[] = [];
  for (const group of value['groups']) {
    if (!isRecord(group)) continue;
    const name = group['name'];
    if (typeof name !== 'string' || !name) continue;
    const schemes = Array.isArray(group['schemes'])
      ? group['schemes'].map(parseScheme).filter((s) => s !== undefined)
      : [];
    if (schemes.length > 0) groups.push({ name, schemes });
  }
  return groups;
}

/** The group holding `path`, by name. `undefined` before the catalog lands, and
 * for a path no group claims. */
export function groupOfScheme(
  groups: readonly ColorGroup[],
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  return groups.find((group) => group.schemes.some((scheme) => scheme.path === path))?.name;
}

/**
 * Which tab to show. A group the user picked wins — but only while the catalog
 * still has it, so a refetch that drops a group doesn't leave the picker
 * showing nothing. Failing that, open on whichever group holds the Active
 * scheme, so a fresh page lands on the colors in play; failing that, the first.
 *
 * Deliberately derived on every read rather than synced into state: there is no
 * moment where the picked tab and the catalog can disagree.
 */
export function openColorGroup(
  groups: readonly ColorGroup[],
  picked: string | undefined,
  activePath: string | undefined,
): string | undefined {
  if (picked !== undefined && groups.some((group) => group.name === picked)) return picked;
  return groupOfScheme(groups, activePath) ?? groups[0]?.name;
}

/** The schemes in the open tab — empty before the catalog lands. */
export function schemesInGroup(
  groups: readonly ColorGroup[],
  name: string | undefined,
): readonly ColorScheme[] {
  return groups.find((group) => group.name === name)?.schemes ?? [];
}
