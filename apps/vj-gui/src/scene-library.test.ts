import { describe, expect, it } from 'vitest';
import { parseSceneLibrary, uniqueByName } from './scene-library';

const ROOT = 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Scenes-35280';

function row(name: string, tag: string, rank: string, folder = `${ROOT}/${name}`): string[] {
  return [name, folder, tag, rank];
}

const HEADER = ['name', 'folder', 'tag', 'rank'];

describe('parseSceneLibrary', () => {
  it('returns an empty list for an absent, empty, or header-only readout', () => {
    expect(parseSceneLibrary(undefined)).toEqual([]);
    expect(parseSceneLibrary([])).toEqual([]);
    expect(parseSceneLibrary([HEADER])).toEqual([]);
  });

  it('maps a row to a scene with a derived tox path and thumbnail url', () => {
    expect(parseSceneLibrary([HEADER, row('AudioSpectrum', 'audio', '200')])).toEqual([
      {
        name: 'AudioSpectrum',
        tag: 'audio',
        rank: 200,
        path: `${ROOT}/AudioSpectrum/AudioSpectrum.tox`,
        thumbnail: '/scenes/AudioSpectrum/thumbnail.jpg',
      },
    ]);
  });

  it('resolves columns by header name, not position', () => {
    const shuffled = [
      ['rank', 'tag', 'folder', 'name'],
      ['200', 'audio', `${ROOT}/AudioSpectrum`, 'AudioSpectrum'],
    ];
    expect(parseSceneLibrary(shuffled)[0]).toMatchObject({
      name: 'AudioSpectrum',
      tag: 'audio',
      rank: 200,
      path: `${ROOT}/AudioSpectrum/AudioSpectrum.tox`,
    });
  });

  it('normalises a backslash folder into a forward-slash tox path', () => {
    const scenes = parseSceneLibrary([
      HEADER,
      row('MetaBalls', 'geometry', '10', 'C:\\Scenes-35280\\MetaBalls'),
    ]);
    expect(scenes[0]?.path).toBe('C:/Scenes-35280/MetaBalls/MetaBalls.tox');
  });

  it('leaves path and thumbnail empty when there is no folder column', () => {
    const scenes = parseSceneLibrary([
      ['name', 'tag', 'rank'],
      ['AudioSpectrum', 'audio', '200'],
    ]);
    expect(scenes[0]).toMatchObject({ name: 'AudioSpectrum', path: '', thumbnail: '' });
  });

  it('sorts by descending rank, with blank and non-numeric ranks last', () => {
    const scenes = parseSceneLibrary([
      HEADER,
      row('Low', 'audio', '10'),
      row('Blank', 'audio', ''),
      row('High', 'audio', '200'),
      row('Junk', 'audio', 'n/a'),
    ]);
    expect(scenes.map((s) => s.name).slice(0, 2)).toEqual(['High', 'Low']);
    expect(scenes.slice(2).map((s) => s.rank)).toEqual([-Infinity, -Infinity]);
  });

  it('keeps one entry per scene-tag pairing', () => {
    const scenes = parseSceneLibrary([
      HEADER,
      row('AudioSpectrum', 'audio', '200'),
      row('AudioSpectrum', 'overlay', '200'),
    ]);
    expect(scenes.map((s) => s.tag)).toEqual(['audio', 'overlay']);
  });

  it('skips rows with no name and trims the tag', () => {
    const scenes = parseSceneLibrary([HEADER, row('', 'audio', '5'), row('Kept', ' audio ', '5')]);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.tag).toBe('audio');
  });

  it('returns an empty list when the name or tag column is missing', () => {
    expect(
      parseSceneLibrary([
        ['folder', 'tag', 'rank'],
        ['x', 'y', 'z'],
      ]),
    ).toEqual([]);
    expect(
      parseSceneLibrary([
        ['name', 'folder', 'rank'],
        ['x', 'y', 'z'],
      ]),
    ).toEqual([]);
  });
});

describe('uniqueByName', () => {
  it('keeps the first entry of each name, preserving order', () => {
    const scenes = parseSceneLibrary([
      HEADER,
      row('AudioSpectrum', 'audio', '200'),
      row('AudioSpectrum', 'overlay', '200'),
      row('MetaBalls', 'geometry', '100'),
    ]);
    expect(uniqueByName(scenes).map((s) => [s.name, s.tag])).toEqual([
      ['AudioSpectrum', 'audio'],
      ['MetaBalls', 'geometry'],
    ]);
  });
});
