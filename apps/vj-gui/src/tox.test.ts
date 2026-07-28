import { describe, expect, it } from 'vitest';
import { toxPath } from './tox';

describe('toxPath', () => {
  it('joins folder and name with forward slashes', () => {
    expect(toxPath('AudioSpectrum', 'AudioSpectrum')).toBe('AudioSpectrum/AudioSpectrum.tox');
  });

  it('converts backslashes in the folder to forward slashes', () => {
    expect(toxPath('Category\\Sub', 'Scene')).toBe('Category/Sub/Scene.tox');
  });

  it('strips a trailing slash from the folder', () => {
    expect(toxPath('AudioSpectrum/', 'AudioSpectrum')).toBe('AudioSpectrum/AudioSpectrum.tox');
  });

  it('returns empty string for an empty folder', () => {
    expect(toxPath('', 'Scene')).toBe('');
  });

  it('returns empty string for an empty name', () => {
    expect(toxPath('Folder', '')).toBe('');
  });
});
