// Online-safe SQLite backup (works while the server is running).
// Usage: node scripts/backup.mjs [backupDir]   (defaults to ./backups)
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR || './data');
const outDir = path.resolve(process.argv[2] || './backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const out = path.join(outDir, `sleep-outfit-${stamp}.db`);
const db = new Database(path.join(dataDir, 'sleep-outfit.db'), { readonly: true });
await db.backup(out);
db.close();
console.log('Backed up to', out);
