// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseArgs, rootsFrom, show } from './cli.mjs';

const SHAPE = { flags: ['--force', '--help'], options: ['--env', '--strip'] };

describe('parseArgs', () => {
  it('separates flags from paths', () => {
    const args = parseArgs(['--force', 'a.db', 'b.db'], SHAPE);
    expect(args.has('--force')).toBe(true);
    expect(args.has('--help')).toBe(false);
    expect(args.paths).toEqual(['a.db', 'b.db']);
  });

  it('collects a repeated option in order', () => {
    const args = parseArgs(['--strip', 'A', '--strip', 'B'], SHAPE);
    expect(args.all('--strip')).toEqual(['A', 'B']);
  });

  it('accepts the --option=value form', () => {
    expect(parseArgs(['--strip=A', 'a.db'], SHAPE).all('--strip')).toEqual(['A']);
  });

  it('answers an unset option with an empty list', () => {
    expect(parseArgs(['a.db'], SHAPE).all('--env')).toEqual([]);
  });

  it('does not swallow a path that follows a flag', () => {
    expect(parseArgs(['--force', 'a.db'], SHAPE).paths).toEqual(['a.db']);
  });

  it('rejects an option with no value', () => {
    expect(() => parseArgs(['--strip'], SHAPE)).toThrow(/--strip needs a value/);
  });

  it('rejects a following flag as the value rather than swallowing it', () => {
    expect(() => parseArgs(['--strip', '--force', 'a.db'], SHAPE)).toThrow(
      /--strip needs a value, got --force/,
    );
  });

  it('takes a leading dash as the value in the --option=value form', () => {
    expect(parseArgs(['--strip=--force'], SHAPE).all('--strip')).toEqual(['--force']);
  });

  it('rejects an unknown option rather than treating it as a path', () => {
    expect(() => parseArgs(['--nope', 'a.db'], SHAPE)).toThrow(/unknown option --nope/);
  });
});

describe('rootsFrom', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.VJ_TEST_ROOT_A;
    delete process.env.VJ_TEST_ROOT_B;
  });

  it('reads the named variables out of the env file', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'VJ_TEST_ROOT_A=C:/a\nVJ_TEST_ROOT_B=  C:/b  \n', 'utf8');
    expect(rootsFrom([file], ['VJ_TEST_ROOT_A', 'VJ_TEST_ROOT_B'])).toEqual(['C:/a', 'C:/b']);
  });

  it('skips an env file that is not there', () => {
    expect(rootsFrom([join(dir, 'missing.env')], ['VJ_TEST_ROOT_A'])).toEqual([]);
  });

  it('drops a variable the env file never set', () => {
    process.env.VJ_TEST_ROOT_A = 'C:/a';
    expect(rootsFrom([], ['VJ_TEST_ROOT_A', 'VJ_TEST_ROOT_B'])).toEqual(['C:/a']);
  });
});

describe('show', () => {
  it('prints a path relative to the cwd with forward slashes', () => {
    expect(show(join(process.cwd(), 'data', 'scenes.db'))).toBe('data/scenes.db');
  });
});
