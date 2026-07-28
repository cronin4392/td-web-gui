import { loadDotEnv } from './env';
import { effectsDbPath, effectsRoot, openEffectsDb, syncEffects } from './effects-db';

loadDotEnv();

const dbPath = effectsDbPath();
const root = effectsRoot(process.env);

const db = openEffectsDb(dbPath);
try {
  const { effects } = syncEffects(db, root);
  console.log(`synced ${effects} effects from ${root} -> ${dbPath}`);
} finally {
  db.close();
}
