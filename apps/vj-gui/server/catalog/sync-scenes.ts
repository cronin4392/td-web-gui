import { requireRestoredDb } from '../platform/catalog-db';
import { loadDotEnv } from '../platform/env';
import { openScenesDb, scenesDbPath, scenesRoot, syncScenes } from './scenes-db';

loadDotEnv();

const dbPath = scenesDbPath();
const root = scenesRoot(process.env);

requireRestoredDb(dbPath);

const db = openScenesDb(dbPath);
try {
  const { scenes } = syncScenes(db, root);
  console.log(`synced ${scenes} scenes from ${root} -> ${dbPath}`);
} finally {
  db.close();
}
