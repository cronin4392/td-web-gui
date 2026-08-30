/**
 * SQLite persistence for the phrase wordbank.
 *
 * Owns the schema, the `PRAGMA user_version` migration + seed, and the two
 * operations `/api/wordbank` needs. No HTTP awareness — `plugin.ts` is the
 * only caller. Uses `node:sqlite` (built into Node ≥22.5, stable in 24) —
 * zero new runtime dependencies.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  defaultTextFields,
  defaultWordbank,
  MIN_TEXT_FIELDS,
  type Overrides,
  type PhraseList,
  type TextField,
  type Wordbank,
} from '../../domain/wordbank/wordbank';
import { catalogDbPath } from '../platform/catalog-db';

const SCHEMA_VERSION = 4;

export function wordbankDbPath(): string {
  return catalogDbPath('VJ_WORDBANK_DB', 'wordbank.db');
}

export function openWordbankDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version >= SCHEMA_VERSION) return;

  // v2 gave a Text field a label as well as a Default; v3 drops it — a field
  // is its Default. No install outlived the pair, so there is nothing to keep.
  if (version === 2) db.exec('DROP TABLE IF EXISTS text_fields');

  db.exec(`
    CREATE TABLE IF NOT EXISTS text_fields (
      id       TEXT PRIMARY KEY,
      value    TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tabs (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS phrases (
      tab_id   TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
      phrase   TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (tab_id, phrase)
    );
    CREATE TABLE IF NOT EXISTS recent (
      phrase   TEXT PRIMARY KEY,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overrides (
      layer    TEXT NOT NULL,
      field_id TEXT NOT NULL REFERENCES text_fields(id) ON DELETE CASCADE,
      value    TEXT NOT NULL,
      PRIMARY KEY (layer, field_id)
    );
  `);

  // Always-at-least-one-list (§3's last-list guard) as a DB invariant: seed once, on first migration.
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tabs').get() as { count: number };
  if (count === 0) writeWordbank(db, defaultWordbank());
  else seedTextFields(db);

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Give a v1 database the minimum pair of fields the later schema requires. */
function seedTextFields(db: DatabaseSync): void {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM text_fields').get() as {
    count: number;
  };
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO text_fields (id, value, position) VALUES (?, ?, ?)');
  for (const [index, field] of defaultTextFields().entries()) {
    insert.run(field.id, field.defaultValue, index);
  }
}

export function readWordbank(db: DatabaseSync): Wordbank {
  const fields = (
    db.prepare('SELECT id, value FROM text_fields ORDER BY position').all() as {
      id: string;
      value: string;
    }[]
  ).map((row) => ({ id: row.id, defaultValue: row.value }) satisfies TextField);

  const listRows = db.prepare('SELECT id, name FROM tabs ORDER BY position').all() as {
    id: string;
    name: string;
  }[];

  const phraseStmt = db.prepare('SELECT phrase FROM phrases WHERE tab_id = ? ORDER BY position');
  const lists: PhraseList[] = listRows.map((row) => ({
    id: row.id,
    name: row.name,
    phrases: (phraseStmt.all(row.id) as { phrase: string }[]).map((p) => p.phrase),
  }));

  const recent = (
    db.prepare('SELECT phrase FROM recent ORDER BY position').all() as { phrase: string }[]
  ).map((r) => r.phrase);

  const overrides: Overrides = {};
  const overrideRows = db
    .prepare('SELECT layer, field_id, value FROM overrides ORDER BY layer, field_id')
    .all() as { layer: string; field_id: string; value: string }[];
  for (const row of overrideRows) (overrides[row.layer] ??= {})[row.field_id] = row.value;

  // Defensive only — the seed guarantees ≥1 list and the minimum pair of
  // fields; an empty result would mean the file was edited by hand. Each half falls
  // back on its own, so a missing list doesn't re-id the fields that survived.
  return {
    fields: fields.length >= MIN_TEXT_FIELDS ? fields : defaultTextFields(),
    overrides,
    ...(lists.length > 0 ? { lists, recent } : { lists: defaultWordbank().lists, recent: [] }),
  };
}

/** Replace the whole wordbank in one transaction — mirrors the client's whole-document rewrite (§5). */
export function writeWordbank(db: DatabaseSync, wordbank: Wordbank): void {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM overrides');
    db.exec('DELETE FROM text_fields');
    db.exec('DELETE FROM phrases');
    db.exec('DELETE FROM tabs');
    db.exec('DELETE FROM recent');

    const insertField = db.prepare(
      'INSERT INTO text_fields (id, value, position) VALUES (?, ?, ?)',
    );
    for (const [index, field] of wordbank.fields.entries()) {
      insertField.run(field.id, field.defaultValue, index);
    }

    const known = new Set(wordbank.fields.map((f) => f.id));
    const insertOverride = db.prepare(
      'INSERT INTO overrides (layer, field_id, value) VALUES (?, ?, ?)',
    );
    for (const [layer, byField] of Object.entries(wordbank.overrides)) {
      for (const [fieldId, value] of Object.entries(byField)) {
        // A client that deleted a field but kept its override would otherwise
        // fail the foreign key and roll the whole wordbank write back.
        if (known.has(fieldId)) insertOverride.run(layer, fieldId, value);
      }
    }

    const insertTab = db.prepare('INSERT INTO tabs (id, name, position) VALUES (?, ?, ?)');
    const insertPhrase = db.prepare(
      'INSERT INTO phrases (tab_id, phrase, position) VALUES (?, ?, ?)',
    );
    for (const [listIndex, list] of wordbank.lists.entries()) {
      insertTab.run(list.id, list.name, listIndex);
      for (const [phraseIndex, phrase] of list.phrases.entries()) {
        insertPhrase.run(list.id, phrase, phraseIndex);
      }
    }

    const insertRecent = db.prepare('INSERT INTO recent (phrase, position) VALUES (?, ?)');
    for (const [index, phrase] of wordbank.recent.entries()) insertRecent.run(phrase, index);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
