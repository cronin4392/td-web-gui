import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Vite only exposes `VITE_`-prefixed vars to the client bundle and never
 * populates `process.env`, so the server side loads `.env` itself. Called from
 * `vite.config.ts` and each `db:*` CLI — the two process entry points. */
export function loadDotEnv(): void {
  const path = resolve(process.cwd(), '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set — copy .env.example to apps/vj-gui/.env and fill it in`);
  }
  return value;
}
