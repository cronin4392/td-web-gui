// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { requiredEnv } from './env';
import { effectsRoot } from './effects-db';
import { scenesRoot } from './scenes-db';

describe('requiredEnv', () => {
  it('returns the trimmed value when set', () => {
    expect(requiredEnv({ ROOT: '  C:/content  ' }, 'ROOT')).toBe('C:/content');
  });

  it('throws naming the variable when unset or blank', () => {
    for (const env of [{}, { ROOT: '' }, { ROOT: '   ' }]) {
      expect(() => requiredEnv(env, 'ROOT')).toThrow(/ROOT is not set/);
    }
  });
});

describe('catalog roots', () => {
  it('refuse to fall back to a hardcoded path', () => {
    expect(() => scenesRoot({})).toThrow(/VJ_SCENES_ROOT is not set/);
    expect(() => effectsRoot({})).toThrow(/VJ_EFFECTS_ROOT is not set/);
  });
});
