import Database from 'better-sqlite3';
import { DB_FILE } from './config.ts';
import { DEFAULT_SETTINGS, type Item, type Nap, type Night, type Settings } from '../shared/model.ts';

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items  (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS nights (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS naps   (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS nights_date ON nights(date);
`);

export type Kind = 'items' | 'nights' | 'naps';
export type RecordOf<K extends Kind> = K extends 'items' ? Item : K extends 'nights' ? Night : Nap;

export function listAll<K extends Kind>(kind: K): RecordOf<K>[] {
  const order = kind === 'items' ? 'id' : 'date, id';
  return db.prepare(`SELECT data FROM ${kind} WHERE deleted = 0 ORDER BY ${order}`).all()
    .map((r: any) => JSON.parse(r.data));
}

export function getRow(kind: Kind, id: string): { data: any; updated_at: number; deleted: number } | undefined {
  const r = db.prepare(`SELECT data, updated_at, deleted FROM ${kind} WHERE id = ?`).get(id) as any;
  return r ? { ...r, data: JSON.parse(r.data) } : undefined;
}

/**
 * Last-write-wins upsert. Returns the record that is now stored (which may be
 * the existing one if the incoming write is older).
 */
export function upsert<K extends Kind>(kind: K, rec: RecordOf<K>): { stored: RecordOf<K> | null; applied: boolean } {
  const cur = getRow(kind, rec.id);
  if (cur && cur.updated_at > rec.updatedAt) return { stored: cur.deleted ? null : cur.data, applied: false };
  const data = JSON.stringify(rec);
  if (kind === 'items') {
    db.prepare(`INSERT INTO items (id, data, updated_at, deleted) VALUES (?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0`).run(rec.id, data, rec.updatedAt);
  } else {
    const date = (rec as Night | Nap).date;
    db.prepare(`INSERT INTO ${kind} (id, date, data, updated_at, deleted) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET date = excluded.date, data = excluded.data, updated_at = excluded.updated_at, deleted = 0`).run(rec.id, date, data, rec.updatedAt);
  }
  return { stored: rec, applied: true };
}

/** Soft delete (tombstone) so a stale offline edit can't resurrect it. */
export function remove(kind: Kind, id: string, updatedAt: number): boolean {
  const cur = getRow(kind, id);
  if (!cur) return false;
  if (cur.updated_at > updatedAt) return false;
  db.prepare(`UPDATE ${kind} SET deleted = 1, updated_at = ? WHERE id = ?`).run(updatedAt, id);
  return true;
}

export function getSettings(): Settings {
  const r = db.prepare('SELECT data FROM settings WHERE id = 1').get() as any;
  return { ...DEFAULT_SETTINGS, updatedAt: 0, ...(r ? JSON.parse(r.data) : {}) };
}

export function putSettings(s: Settings): Settings {
  const cur = getSettings();
  if (cur.updatedAt > s.updatedAt) return cur;
  const next = { ...cur, ...s };
  db.prepare(`INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(JSON.stringify(next), next.updatedAt);
  return next;
}

export function getMeta(key: string): string | undefined {
  return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any)?.value;
}
export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
