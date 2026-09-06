import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const show = (path) => relative(process.cwd(), path).split(sep).join('/');

export function parseArgs(argv, { flags = [], options = [] } = {}) {
  const seen = new Set();
  const values = new Map();
  const paths = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (flags.includes(arg)) {
      seen.add(arg);
      continue;
    }
    const option = options.find((name) => arg === name || arg.startsWith(`${name}=`));
    if (option) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[i + 1];
      if (value === undefined) throw new Error(`${option} needs a value`);
      // A mistyped `--strip --force a.db` would otherwise eat the flag as the value.
      if (!arg.includes('=')) {
        if (value.startsWith('-')) throw new Error(`${option} needs a value, got ${value}`);
        i += 1;
      }
      values.set(option, [...(values.get(option) ?? []), value]);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    paths.push(arg);
  }
  return { has: (flag) => seen.has(flag), all: (option) => values.get(option) ?? [], paths };
}

export function rootsFrom(envFiles, varNames) {
  for (const file of envFiles) {
    const path = resolve(file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
  return varNames.map((name) => process.env[name]?.trim()).filter(Boolean);
}
