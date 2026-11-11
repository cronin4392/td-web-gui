/**
 * A call's reply is untyped JSON, so the catalog parser is the only thing
 * standing between a drifted `td/gui-config.py` and a crash mid-render. It has
 * to keep every scheme it can read and drop the rest.
 */

import { describe, expect, it } from 'vitest';
import { groupOfScheme, openColorGroup, parseColorGroups, schemesInGroup } from './colorSchemes';

const RED_TO_BLUE = [
  [0, 1, 0, 0, 1],
  [1, 0, 0, 1, 1],
];

const CATALOG = {
  groups: [
    {
      name: 'Colors',
      schemes: [
        { name: 'LightBlueRed', path: '/GUI/…/Colors/LightBlueRed', stops: RED_TO_BLUE },
        { name: 'MadMax', path: '/GUI/…/Colors/MadMax', stops: RED_TO_BLUE },
      ],
    },
    {
      name: 'Spectrum',
      schemes: [{ name: 'Rainbow', path: '/GUI/…/Spectrum/Rainbow', stops: RED_TO_BLUE }],
    },
  ],
};

describe('parseColorGroups', () => {
  it('reads groups and their schemes in the order TD sent them', () => {
    const groups = parseColorGroups(CATALOG);
    expect(groups.map((g) => g.name)).toEqual(['Colors', 'Spectrum']);
    expect(groups[0]!.schemes.map((s) => s.name)).toEqual(['LightBlueRed', 'MadMax']);
    expect(groups[0]!.schemes[0]!.stops).toEqual(RED_TO_BLUE);
  });

  it('reads anything that is not a catalog as an empty one', () => {
    for (const value of [undefined, null, 'groups', 42, [], {}, { groups: 'Colors' }]) {
      expect(parseColorGroups(value)).toEqual([]);
    }
  });

  it('drops a scheme missing a name or a path', () => {
    // Either one absent leaves nothing to label the swatch or to select with.
    const groups = parseColorGroups({
      groups: [
        {
          name: 'Colors',
          schemes: [
            { name: 'Good', path: '/a', stops: RED_TO_BLUE },
            { name: '', path: '/b', stops: RED_TO_BLUE },
            { path: '/c', stops: RED_TO_BLUE },
            { name: 'NoPath', stops: RED_TO_BLUE },
          ],
        },
      ],
    });
    expect(groups[0]!.schemes.map((s) => s.name)).toEqual(['Good']);
  });

  it('keeps a scheme whose ramp did not sample', () => {
    // Still selectable — an empty swatch says more than a missing one.
    const groups = parseColorGroups({
      groups: [{ name: 'Colors', schemes: [{ name: 'Blank', path: '/a', stops: [] }] }],
    });
    expect(groups[0]!.schemes[0]).toEqual({ name: 'Blank', path: '/a', stops: [] });
  });

  it('drops a malformed stop without dropping its scheme', () => {
    const groups = parseColorGroups({
      groups: [
        {
          name: 'Colors',
          schemes: [
            {
              name: 'Partial',
              path: '/a',
              stops: [
                [0, 1, 0, 0, 1],
                [0.5, 1, 0],
                ['1', '0', '0', '1', '1'],
                [1, 0, 0, 1, 1],
              ],
            },
          ],
        },
      ],
    });
    expect(groups[0]!.schemes[0]!.stops).toEqual(RED_TO_BLUE);
  });

  it('trims a stop carrying extra columns', () => {
    const groups = parseColorGroups({
      groups: [{ name: 'C', schemes: [{ name: 'S', path: '/a', stops: [[0, 1, 0, 0, 1, 99]] }] }],
    });
    expect(groups[0]!.schemes[0]!.stops).toEqual([[0, 1, 0, 0, 1]]);
  });

  it('drops a group with nothing left in it', () => {
    // An empty tab is only noise — there is nothing to pick inside it.
    expect(
      parseColorGroups({ groups: [{ name: 'Colors', schemes: [] }, { name: 'Spectrum' }] }),
    ).toEqual([]);
  });
});

describe('groupOfScheme', () => {
  const groups = parseColorGroups(CATALOG);

  it('names the group holding a path', () => {
    expect(groupOfScheme(groups, '/GUI/…/Spectrum/Rainbow')).toBe('Spectrum');
  });

  it('has no group before TD has synced a selection', () => {
    expect(groupOfScheme(groups, undefined)).toBeUndefined();
    expect(groupOfScheme(groups, '')).toBeUndefined();
  });

  it('has no group for a path the catalog does not claim', () => {
    // TD's par can point at a scheme that has since been renamed or untagged.
    expect(groupOfScheme(groups, '/GUI/…/Dynamic/Dynamic')).toBeUndefined();
  });
});

describe('openColorGroup', () => {
  const groups = parseColorGroups(CATALOG);
  const RAINBOW = '/GUI/…/Spectrum/Rainbow';

  it('opens on the group holding the active scheme before anything is picked', () => {
    // A fresh page should land on the colors actually in play, not on tab one.
    expect(openColorGroup(groups, undefined, RAINBOW)).toBe('Spectrum');
  });

  it('opens on the first group when TD has not synced a selection', () => {
    expect(openColorGroup(groups, undefined, undefined)).toBe('Colors');
  });

  it('keeps the picked tab even when the active scheme is elsewhere', () => {
    // Selecting a color must not yank the user out of the tab they opened.
    expect(openColorGroup(groups, 'Colors', RAINBOW)).toBe('Colors');
  });

  it('falls back when a refetch drops the picked group', () => {
    // Untagging a color group in TD leaves the picked name pointing at nothing.
    expect(openColorGroup(groups, 'Dynamic', RAINBOW)).toBe('Spectrum');
  });

  it('has no tab to open before the catalog lands', () => {
    expect(openColorGroup([], 'Colors', RAINBOW)).toBeUndefined();
  });
});

describe('schemesInGroup', () => {
  const groups = parseColorGroups(CATALOG);

  it('lists a group in the order TD sent it', () => {
    expect(schemesInGroup(groups, 'Colors').map((s) => s.name)).toEqual(['LightBlueRed', 'MadMax']);
  });

  it('lists nothing for a group that is not there', () => {
    expect(schemesInGroup(groups, 'Dynamic')).toEqual([]);
    expect(schemesInGroup(groups, undefined)).toEqual([]);
  });
});
