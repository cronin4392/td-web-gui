import { describe, expect, it } from 'vitest';
import { activeSceneFolder, activeSceneName, asLayerId, performanceStat } from './wire';

describe('asLayerId', () => {
  it('passes a layer letter through', () => {
    expect(asLayerId('D')).toBe('D');
  });

  it('is undefined for a payload with no layer in it', () => {
    expect(asLayerId(undefined)).toBeUndefined();
  });

  it('is undefined for the empty par of a loader that has no scene key', () => {
    expect(asLayerId('')).toBeUndefined();
  });

  it('is undefined for a letter past the eight loaders', () => {
    expect(asLayerId('I')).toBeUndefined();
  });

  it('does not accept a lowercase letter, which names no loader', () => {
    expect(asLayerId('d')).toBeUndefined();
  });
});

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

describe('activeSceneName', () => {
  it('drops the folder and the .tox', () => {
    expect(activeSceneName('C:/Scenes/AudioSpectrum/AudioSpectrum.tox')).toBe('AudioSpectrum');
  });

  it('accepts backslashes, which a par can hold even though loadScene cannot send them', () => {
    expect(activeSceneName('C:\\Scenes\\A\\A.tox')).toBe('A');
  });

  it('takes the last separator when both kinds appear', () => {
    expect(activeSceneName('C:\\Scenes/A/Nested.tox')).toBe('Nested');
  });

  it('accepts a bare filename, which names a scene even though it names no folder', () => {
    expect(activeSceneName('A.tox')).toBe('A');
  });

  it('keeps a name that is not a .tox, since the par reports whatever it holds', () => {
    expect(activeSceneName('C:/Scenes/A/A.toe')).toBe('A.toe');
  });

  it('is undefined before TD has synced a path', () => {
    expect(activeSceneName(undefined)).toBeUndefined();
  });

  it('is undefined for the empty par a layer starts on', () => {
    expect(activeSceneName('')).toBeUndefined();
  });

  it('is undefined for a path ending in a separator, which names no file', () => {
    expect(activeSceneName('C:/Scenes/A/')).toBeUndefined();
  });
});

describe('performanceStat', () => {
  const table = [
    ['cpuCookTime', '0.7'],
    ['gpuCookTime', '4.8'],
    ['gpu_mem_used', '129'],
    ['fps', '30.6'],
    ['cookTime', '9.400001'],
  ];

  it('reads a row by its TD name', () => {
    expect(performanceStat(table, 'fps')).toBe(30.6);
    expect(performanceStat(table, 'gpu_mem_used')).toBe(129);
    expect(performanceStat(table, 'cookTime')).toBe(9.400001);
  });

  it('is undefined before TD has synced the table', () => {
    expect(performanceStat(undefined, 'fps')).toBeUndefined();
  });

  it('is undefined for a row the table does not have', () => {
    expect(performanceStat(table, 'gpuMemory')).toBeUndefined();
  });

  it('is undefined for a row that does not hold a number', () => {
    expect(performanceStat([['fps', '']], 'fps')).toBeUndefined();
    expect(performanceStat([['fps', 'n/a']], 'fps')).toBeUndefined();
  });
});
