import { requireRestoredDb } from '../platform/catalog-db';
import { loadDotEnv } from '../platform/env';
import { effectsDbPath, effectsRoot, openEffectsDb, syncEffects } from './effects-db';

loadDotEnv();

const dbPath = effectsDbPath();
const root = effectsRoot(process.env);

requireRestoredDb(dbPath);

const db = openEffectsDb(dbPath);
try {
  const { effects } = syncEffects(db, root);
  console.log(`synced ${effects} effects from ${root} -> ${dbPath}`);
} finally {
  db.close();
}
