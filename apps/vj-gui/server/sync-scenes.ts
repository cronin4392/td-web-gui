import { scenesRoot } from '../src/scenes.config';
import { openScenesDb, scenesDbPath, syncScenes } from './scenes-db';

const dbPath = scenesDbPath();
const root = scenesRoot(process.env);

const db = openScenesDb(dbPath);
try {
  const { scenes, tags } = syncScenes(db, root);
  console.log(`synced ${scenes} scenes (${tags} tag rows) from ${root} -> ${dbPath}`);
} finally {
  db.close();
}
