import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';
import {
  effectFrom,
  type Effect,
  type EffectCatalog,
  type EffectFields,
} from '../domain/catalog/effect';
import {
  byName,
  catalogDbPath,
  directoryNames,
  isFile,
  openCatalogDb,
  transaction,
} from './catalog-db';
import { requiredEnv } from './env';

const TABLE_COLUMNS: Record<string, string[]> = {
  effects: ['name', 'folder'],
};

const DDL = `
  DROP TABLE IF EXISTS effects;
  CREATE TABLE effects (
    -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
    -- KEY column hold NULL, and any number of them.
    name   TEXT PRIMARY KEY NOT NULL,
    folder TEXT NOT NULL
  );
`;

/** Read by the dev/preview server only — effects have no browser-facing assets,
 * so unlike the scene library this root never reaches the client. */
export function effectsRoot(env: Record<string, string | undefined>): string {
  return requiredEnv(env, 'VJ_EFFECTS_ROOT');
}

export function effectsDbPath(): string {
  return catalogDbPath('VJ_EFFECTS_DB', 'effects.db');
}

export function openEffectsDb(path: string): DatabaseSync {
  return openCatalogDb(path, TABLE_COLUMNS, DDL);
}

/** Flattening two levels into one name-keyed catalog makes a collision possible,
 * so it is named rather than left to surface as a UNIQUE constraint failure. */
function assertNamesAreUnique(fields: EffectFields[]): void {
  const seen = new Map<string, string>();
  for (const { name, folder } of fields) {
    const first = seen.get(name);
    if (first) throw new Error(`duplicate effect name "${name}": ${first} and ${folder}`);
    seen.set(name, folder);
  }
}

/**
 * Effects sit two levels down, under the group folder that used to carry their
 * tag; the catalog deliberately drops that level. A folder counts as an effect
 * only when it holds a matching `<name>.tox`, which is what keeps archives
 * (`_other/`) and half-deleted folders out.
 */
function scanEffectFields(root: string): EffectFields[] {
  const base = resolve(root).replace(/\\/g, '/');

  const fields: EffectFields[] = [];
  for (const group of directoryNames(base)) {
    for (const name of directoryNames(`${base}/${group}`)) {
      const folder = `${base}/${group}/${name}`;
      if (!isFile(join(folder, `${name}.tox`))) continue;
      fields.push({ name, folder });
    }
  }

  fields.sort(byName);
  assertNamesAreUnique(fields);
  return fields;
}

export function scanEffectFolders(root: string): EffectCatalog {
  return scanEffectFields(root).map(effectFrom);
}

/** Rebuild the catalog from disk in one transaction — the whole scan or none of
 * it. Scanning happens first so a failed scan leaves the prior catalog serving
 * rather than emptying it. */
export function syncEffects(db: DatabaseSync, root: string): { effects: number } {
  const effects = scanEffectFields(root);

  return transaction(db, () => {
    db.exec('DELETE FROM effects');
    const insert = db.prepare('INSERT INTO effects (name, folder) VALUES (?, ?)');
    for (const effect of effects) insert.run(effect.name, effect.folder);
    return { effects: effects.length };
  });
}

export function readEffects(db: DatabaseSync): EffectCatalog {
  const rows = db.prepare('SELECT name, folder FROM effects').all() as {
    name: string;
    folder: string;
  }[];
  return rows.map((row): Effect => effectFrom(row)).sort(byName);
}
