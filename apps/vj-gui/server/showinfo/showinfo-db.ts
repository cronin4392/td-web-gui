import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  defaultShowDocument,
  type Alias,
  type Artist,
  type LayerOverrides,
  type ShowDocument,
  type ShowRow,
} from '../../domain/showinfo/showinfo';
import { catalogDbPath, checkpointWal, requireRestoredDb } from '../platform/catalog-db';

const SCHEMA_VERSION = 2;

export function showInfoDbPath(): string {
  return catalogDbPath('VJ_SHOWINFO_DB', 'showinfo.db');
}

export function openShowInfoDb(path: string): DatabaseSync {
  requireRestoredDb(path);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  if (version >= SCHEMA_VERSION) return;
  if (version === 1) {
    db.exec(`
      DELETE FROM show_rows WHERE alias = 'crew';
      ALTER TABLE artists DROP COLUMN crew;
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS show_rows (
      id       TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      alias    TEXT,
      text     TEXT NOT NULL,
      is_on    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artists (
      id        TEXT PRIMARY KEY,
      position  INTEGER NOT NULL,
      name      TEXT NOT NULL,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS layer_overrides (
      layer TEXT NOT NULL,
      slot  INTEGER NOT NULL,
      text  TEXT NOT NULL,
      PRIMARY KEY (layer, slot)
    );
  `);

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM show_rows').get() as {
    count: number;
  };
  if (count === 0) writeShowDocument(db, defaultShowDocument());

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function readShowDocument(db: DatabaseSync): ShowDocument {
  const rows = (
    db.prepare('SELECT id, alias, text, is_on FROM show_rows ORDER BY position').all() as {
      id: string;
      alias: string | null;
      text: string;
      is_on: number;
    }[]
  ).map((row): ShowRow => ({
    id: row.id,
    alias: row.alias as Alias | null,
    text: row.text,
    on: row.is_on === 1,
  }));

  const artists = (
    db.prepare('SELECT id, name, is_active FROM artists ORDER BY position').all() as {
      id: string;
      name: string;
      is_active: number;
    }[]
  ).map((row): Artist => ({
    id: row.id,
    name: row.name,
    active: row.is_active === 1,
  }));

  const overrides: LayerOverrides = {};
  const overrideRows = db
    .prepare('SELECT layer, slot, text FROM layer_overrides ORDER BY layer, slot')
    .all() as { layer: string; slot: number; text: string }[];
  for (const { layer, slot, text } of overrideRows) {
    const texts = (overrides[layer] ??= []);
    while (texts.length < slot) texts.push('');
    texts[slot] = text;
  }

  return { show: { rows, artists }, overrides };
}

export function writeShowDocument(db: DatabaseSync, doc: ShowDocument): void {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM show_rows');
    db.exec('DELETE FROM artists');
    db.exec('DELETE FROM layer_overrides');

    const insertRow = db.prepare(
      'INSERT INTO show_rows (id, position, alias, text, is_on) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [position, row] of doc.show.rows.entries()) {
      insertRow.run(row.id, position, row.alias, row.text, row.on ? 1 : 0);
    }

    const insertArtist = db.prepare(
      'INSERT INTO artists (id, position, name, is_active) VALUES (?, ?, ?, ?)',
    );
    for (const [position, artist] of doc.show.artists.entries()) {
      insertArtist.run(artist.id, position, artist.name, artist.active ? 1 : 0);
    }

    const insertOverride = db.prepare(
      'INSERT INTO layer_overrides (layer, slot, text) VALUES (?, ?, ?)',
    );
    for (const [layer, texts] of Object.entries(doc.overrides)) {
      for (const [slot, text] of texts.entries()) insertOverride.run(layer, slot, text);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  checkpointWal(db);
}
