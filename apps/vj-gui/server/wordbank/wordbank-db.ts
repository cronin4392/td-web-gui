/**
 * SQLite persistence for the phrase wordbank (TEXT_SELECTOR.md §5).
 *
 * Owns the schema, the `PRAGMA user_version` migration + seed, and the two
 * operations `/api/wordbank` needs. No HTTP awareness — `plugin.ts` is the
 * only caller. Uses `node:sqlite` (built into Node ≥22.5, stable in 24) —
 * zero new runtime dependencies.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultWordbank, type PhraseList, type Wordbank } from '../../domain/wordbank/wordbank';
import { catalogDbPath, checkpointWal } from '../platform/catalog-db';

const SCHEMA_VERSION = 1;

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

  // Always-at-least-one-list (§3's last-list guard) as a DB invariant: seed once, on first migration.
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tabs').get() as { count: number };
  if (count === 0) writeWordbank(db, defaultWordbank());

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function readWordbank(db: DatabaseSync): Wordbank {
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

  // Defensive only — the seed guarantees ≥1 list; an empty result would mean the file was edited by hand.
  return lists.length > 0 ? { lists, recent } : defaultWordbank();
}

/** Replace the whole wordbank in one transaction — mirrors the client's whole-document rewrite (§5). */
export function writeWordbank(db: DatabaseSync, wordbank: Wordbank): void {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM phrases');
    db.exec('DELETE FROM tabs');
    db.exec('DELETE FROM recent');

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
  // Outside the transaction, and after it: a commit that only lives in the -wal
  // is invisible to anything copying this file without going through SQLite.
  checkpointWal(db);
}
