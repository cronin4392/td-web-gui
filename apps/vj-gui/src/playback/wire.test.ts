import { describe, expect, it } from 'vitest';
import { activeSceneFolder } from './wire';

describe('activeSceneFolder', () => {
  it('reads the Folder row', () => {
    expect(
      activeSceneFolder([
        ['Scene', 'C:/Scenes/AudioSpectrum/AudioSpectrum.tox'],
        ['SceneName', 'AudioSpectrum'],
        ['Folder', 'C:/Scenes/AudioSpectrum'],
      ]),
    ).toBe('C:/Scenes/AudioSpectrum');
  });

  it('is undefined before TD has synced a table', () => {
    expect(activeSceneFolder(undefined)).toBeUndefined();
  });

  it('is undefined for an empty table', () => {
    expect(activeSceneFolder([])).toBeUndefined();
  });

  it('is undefined when no row is Folder', () => {
    expect(activeSceneFolder([['Scene', 'C:/Scenes/A/A.tox']])).toBeUndefined();
  });

  it('is undefined when the Folder row is empty', () => {
    expect(activeSceneFolder([['Folder', '']])).toBeUndefined();
  });

  it('is undefined when the Folder row has no value cell', () => {
    expect(activeSceneFolder([['Folder']])).toBeUndefined();
  });

  it('ignores a header row that only names the columns', () => {
    expect(
      activeSceneFolder([
        ['name', 'value'],
        ['Folder', 'C:/Scenes/A'],
      ]),
    ).toBe('C:/Scenes/A');
  });
});
