import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';
import {
  effectFrom,
  type Effect,
  type EffectCatalog,
  type EffectFields,
} from '../../domain/catalog/effect';
import {
  byName,
  catalogDbPath,
  directoryNames,
  isFile,
  openCatalogDb,
  pruneRows,
  transaction,
  type TableColumns,
} from '../platform/catalog-db';
import { requiredEnv } from '../platform/env';

const TABLE_COLUMNS: TableColumns = {
  effects: {
    name: 'TEXT PRIMARY KEY NOT NULL',
    folder: 'TEXT NOT NULL',
    hidden: 'INTEGER NOT NULL DEFAULT 0',
  },
};

const DDL = `
  DROP TABLE IF EXISTS effects;
  CREATE TABLE effects (
    -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
    -- KEY column hold NULL, and any number of them.
    name   TEXT PRIMARY KEY NOT NULL,
    folder TEXT NOT NULL,
    -- Authored in the GUI, which is why the sync's upsert never names it.
    hidden INTEGER NOT NULL DEFAULT 0
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

/** Reconcile the catalog against disk in one transaction — the whole scan or none
 * of it. Scanning happens first so a failed scan leaves the prior catalog serving
 * rather than emptying it. */
export function syncEffects(db: DatabaseSync, root: string): { effects: number } {
  const effects = scanEffectFields(root);

  return transaction(db, () => {
    // Naming every scanned column and no authored one is what carries `hidden`
    // through a sync: an effect that is still on disk keeps the row it had, even
    // when it moved to another group.
    const upsert = db.prepare(`
      INSERT INTO effects (name, folder) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET folder = excluded.folder
    `);
    for (const effect of effects) upsert.run(effect.name, effect.folder);
    pruneRows(db, 'effects', new Set(effects.map((effect) => effect.name)));
    return { effects: effects.length };
  });
}

/** Throws on a name no effect carries: the picker only ever names an effect it
 * just rendered, so a miss means the catalog moved under it — worth surfacing. */
export function setEffectHidden(db: DatabaseSync, name: string, hidden: boolean): void {
  const { changes } = db
    .prepare('UPDATE effects SET hidden = ? WHERE name = ?')
    .run(hidden ? 1 : 0, name);
  if (changes === 0) throw new Error(`no such effect "${name}"`);
}

export function readEffects(db: DatabaseSync): EffectCatalog {
  const rows = db.prepare('SELECT name, folder, hidden FROM effects').all() as {
    name: string;
    folder: string;
    hidden: number;
  }[];
  return rows.map((row): Effect => effectFrom({ ...row, hidden: row.hidden !== 0 })).sort(byName);
}
