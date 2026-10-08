// Whitelist and coerce incoming records so only known fields reach the database.
import { CATS, DEFAULT_SETTINGS, type Item, type Nap, type Night, type Settings } from '../shared/model.ts';

const str = (v: unknown, max = 500) => (v == null ? '' : String(v).slice(0, max));
const num = (v: unknown, dflt = 0) => { const n = Number(v); return isFinite(n) ? n : dflt; };
const numOrNull = (v: unknown) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
const strList = (v: unknown) => (Array.isArray(v) ? v.slice(0, 20).map(x => str(x, 100)) : []);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], dflt: T): T => (opts.includes(v as T) ? (v as T) : dflt);
const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const time = (v: unknown, dflt: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : dflt);
const rating = (v: unknown) => (v == null ? null : [-2, -1, 0, 1, 2].includes(Number(v)) ? Number(v) : null);
const updatedAt = (v: unknown) => Math.min(num(v, Date.now()), Date.now() + 60_000);
const photoUrl = (v: unknown) => (typeof v === 'string' && /^\/photos\/[0-9a-f-]{36}\.jpg$/.test(v) ? v : '');
const link = (v: unknown) => { const s = str(v, 2000).trim(); return /^https?:\/\//i.test(s) ? s : s ? 'https://' + s : ''; };

export function sanitizeItem(r: any, pathId?: string): Item | null {
  const i = id(pathId ?? r?.id);
  if (!i || (pathId && r?.id && r.id !== pathId)) return null;
  return {
    id: i,
    name: str(r.name, 120).trim() || 'Unnamed',
    cat: oneOf(r.cat, CATS.map(c => c.id), 'bag'),
    tog: Math.max(0, Math.min(5, Math.round(num(r.tog) * 10) / 10)),
    sleeve: oneOf(r.sleeve, ['short', 'long', 'none'] as const, 'none'),
    legs: oneOf(r.legs, ['footed', 'footless', 'shorts', 'na'] as const, 'na'),
    fabric: str(r.fabric, 120),
    size: str(r.size, 60),
    link: link(r.link),
    photoUrl: photoUrl(r.photoUrl),
    available: r.available !== false,
    notes: str(r.notes, 2000),
    updatedAt: updatedAt(r.updatedAt),
  };
}

export function sanitizeNight(r: any, pathId?: string): Night | null {
  const i = id(pathId ?? r?.id), d = date(r?.date);
  if (!i || !d || (pathId && r?.id && r.id !== pathId)) return null;
  const range = r.outdoorRange && isFinite(r.outdoorRange.min) && isFinite(r.outdoorRange.max)
    ? { min: num(r.outdoorRange.min), max: num(r.outdoorRange.max) } : null;
  const n: Night = {
    id: i, date: d,
    room: num(r.room), humidity: numOrNull(r.humidity), outdoor: num(r.outdoor), outdoorRange: range,
    thermo: num(r.thermo), door: oneOf(r.door, ['closed', 'open'] as const, 'closed'),
    overnight: num(r.overnight), items: strList(r.items), tog: num(r.tog),
    rating: rating(r.rating), signs: strList(r.signs), health: strList(r.health), note: str(r.note, 2000),
    morningRoom: numOrNull(r.morningRoom), morningHum: numOrNull(r.morningHum), actual: numOrNull(r.actual),
    updatedAt: updatedAt(r.updatedAt),
  };
  const target = numOrNull(r.target);
  if (target != null) n.target = target;
  return n;
}

export function sanitizeNap(r: any, pathId?: string): Nap | null {
  const i = id(pathId ?? r?.id), d = date(r?.date);
  if (!i || !d || (pathId && r?.id && r.id !== pathId)) return null;
  return {
    id: i, date: d, start: time(r.start, '12:30'), end: time(r.end, '14:30'),
    room: num(r.room), overnight: num(r.overnight), door: oneOf(r.door, ['closed', 'open'] as const, 'closed'),
    outdoor: numOrNull(r.outdoor), items: strList(r.items), tog: num(r.tog), rating: rating(r.rating),
    health: strList(r.health), updatedAt: updatedAt(r.updatedAt),
  };
}

export function sanitizeSettings(r: any): Settings {
  const d = DEFAULT_SETTINGS;
  const numOrStr = (v: unknown, dflt: number | string) => (v === '' ? '' : v == null ? dflt : isFinite(Number(v)) ? Number(v) : str(v, 20));
  return {
    child: str(r.child ?? d.child, 60),
    age: numOrStr(r.age, d.age),
    postcode: str(r.postcode ?? d.postcode, 10),
    city: str(r.city ?? d.city, 80),
    lat: numOrStr(r.lat, d.lat),
    lon: numOrStr(r.lon, d.lon),
    learning: r.learning == null ? d.learning : !!r.learning,
    remind: r.remind == null ? d.remind : !!r.remind,
    remindAt: time(r.remindAt, d.remindAt),
    updatedAt: updatedAt(r.updatedAt),
  };
}
