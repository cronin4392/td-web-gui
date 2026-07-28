/**
 * SQLite persistence for the phrase library (TEXT_SELECTOR.md §5).
 *
 * Owns the schema, the `PRAGMA user_version` migration + seed, and the two
 * operations `/api/library` needs. No HTTP awareness — `plugin.ts` is the
 * only caller. Uses `node:sqlite` (built into Node ≥22.5, stable in 24) —
 * zero new runtime dependencies.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defaultLibrary, type Library, type PhraseTab } from '../../domain/wordbank/wordbank';

const SCHEMA_VERSION = 1;

/** `data/text-selector.db` under `root`, or `TEXT_SELECTOR_DB` when set. */
export function resolveDbPath(root: string): string {
  const override = process.env.TEXT_SELECTOR_DB;
  return override ? resolve(override) : resolve(root, 'data', 'text-selector.db');
}

export function openLibraryDb(path: string): DatabaseSync {
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

  db.exec(`
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
  `);

  // Always-at-least-one-tab (§3's last-tab guard) as a DB invariant: seed once, on first migration.
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tabs').get() as { count: number };
  if (count === 0) writeLibrary(db, defaultLibrary());

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function readLibrary(db: DatabaseSync): Library {
  const tabRows = db.prepare('SELECT id, name FROM tabs ORDER BY position').all() as {
    id: string;
    name: string;
  }[];

  const phraseStmt = db.prepare('SELECT phrase FROM phrases WHERE tab_id = ? ORDER BY position');
  const tabs: PhraseTab[] = tabRows.map((row) => ({
    id: row.id,
    name: row.name,
    phrases: (phraseStmt.all(row.id) as { phrase: string }[]).map((p) => p.phrase),
  }));

  const recent = (
    db.prepare('SELECT phrase FROM recent ORDER BY position').all() as { phrase: string }[]
  ).map((r) => r.phrase);

  // Defensive only — the seed guarantees ≥1 tab; an empty result would mean the file was edited by hand.
  return tabs.length > 0 ? { tabs, recent } : defaultLibrary();
}

/** Replace the whole library in one transaction — mirrors the client's whole-document rewrite (§5). */
export function writeLibrary(db: DatabaseSync, library: Library): void {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM phrases');
    db.exec('DELETE FROM tabs');
    db.exec('DELETE FROM recent');

    const insertTab = db.prepare('INSERT INTO tabs (id, name, position) VALUES (?, ?, ?)');
    const insertPhrase = db.prepare(
      'INSERT INTO phrases (tab_id, phrase, position) VALUES (?, ?, ?)',
    );
    for (const [tabIndex, tab] of library.tabs.entries()) {
      insertTab.run(tab.id, tab.name, tabIndex);
      for (const [phraseIndex, phrase] of tab.phrases.entries()) {
        insertPhrase.run(tab.id, phrase, phraseIndex);
      }
    }

    const insertRecent = db.prepare('INSERT INTO recent (phrase, position) VALUES (?, ?)');
    for (const [index, phrase] of library.recent.entries()) insertRecent.run(phrase, index);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
