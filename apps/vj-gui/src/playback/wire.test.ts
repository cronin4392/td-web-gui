import { describe, expect, it } from 'vitest';
import { activeSceneFolder } from './wire';

describe('activeSceneFolder', () => {
  it('drops the .tox filename', () => {
    expect(activeSceneFolder('C:/Scenes/AudioSpectrum/AudioSpectrum.tox')).toBe(
      'C:/Scenes/AudioSpectrum',
    );
  });

  it('accepts backslashes, which a par can hold even though loadScene cannot send them', () => {
    expect(activeSceneFolder('C:\\Scenes\\A\\A.tox')).toBe('C:\\Scenes\\A');
  });

  it('takes the last separator when both kinds appear', () => {
    expect(activeSceneFolder('C:\\Scenes/A/A.tox')).toBe('C:\\Scenes/A');
  });

  it('is undefined before TD has synced a path', () => {
    expect(activeSceneFolder(undefined)).toBeUndefined();
  });

  it('is undefined for the empty par a layer starts on', () => {
    expect(activeSceneFolder('')).toBeUndefined();
  });

  it('is undefined for a bare filename with no folder', () => {
    expect(activeSceneFolder('A.tox')).toBeUndefined();
  });

  it('is undefined at the filesystem root, which is no scene library', () => {
    expect(activeSceneFolder('/A.tox')).toBeUndefined();
  });

  it('is undefined at a drive root, the form the root actually takes here', () => {
    expect(activeSceneFolder('C:/A.tox')).toBeUndefined();
    expect(activeSceneFolder('C:\\A.tox')).toBeUndefined();
  });
});
