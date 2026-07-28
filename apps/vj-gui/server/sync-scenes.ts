import { loadDotEnv } from './env';
import { openScenesDb, scenesDbPath, scenesRoot, syncScenes } from './scenes-db';

loadDotEnv();

const dbPath = scenesDbPath();
const root = scenesRoot(process.env);

const db = openScenesDb(dbPath);
try {
  const { scenes, tags } = syncScenes(db, root);
  console.log(`synced ${scenes} scenes (${tags} tag rows) from ${root} -> ${dbPath}`);
} finally {
  db.close();
}
