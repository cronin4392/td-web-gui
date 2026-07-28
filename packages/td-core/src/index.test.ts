import { describe, expect, it } from 'vitest';
import * as td from './index';

describe('td-core public surface', () => {
  it('exposes a version string', () => {
    expect(typeof td.version).toBe('string');
  });

  it('exports the core API', () => {
    expect(typeof td.parse).toBe('function');
    expect(td.PROTOCOL_VERSION).toBe(1);
    expect(typeof td.createTDConnection).toBe('function');
    expect(typeof td.createTDClient).toBe('function');
    expect(typeof td.createTDSignal).toBe('function');
    expect(typeof td.createTDHandler).toBe('function');
    expect(typeof td.TDCallError).toBe('function');
    expect(typeof td.TextInput).toBe('function');
    expect(typeof td.NumberInput).toBe('function');
    expect(typeof td.RangeInput).toBe('function');
    expect(typeof td.Value).toBe('function');
    expect(typeof td.Table).toBe('function');
  });
});
