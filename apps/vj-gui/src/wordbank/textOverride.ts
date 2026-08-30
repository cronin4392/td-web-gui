import { escapeNewlines, unescapeNewlines } from 'td-core';

export function textOverride(wire: string, defaultValue: string): string | undefined {
  if (!wire || wire === escapeNewlines(defaultValue)) return undefined;
  return unescapeNewlines(wire);
}

export function wireDefault(defaultValue: string): string {
  return escapeNewlines(defaultValue);
}
