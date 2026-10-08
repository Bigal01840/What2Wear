// The sleep-outfit model, ported from the prototype's <script data-dc-script>.
// Shared by the PWA (recommendations) and the server (seed, reminders).
// Keep the maths identical to the prototype; see README "The model".

export type Cat = 'bag' | 'suit' | 'pjs' | 'body' | 'socks';
export type Slot = 'base' | 'mid' | 'bag' | 'socks';
export type Door = 'closed' | 'open';
export type Sleeve = 'short' | 'long' | 'none';
export type Legs = 'footed' | 'footless' | 'shorts' | 'na';

export interface Item {
  id: string;
  name: string;
  cat: Cat;
  tog: number;
  sleeve: Sleeve;
  legs: Legs;
  fabric: string;
  size: string;
  link: string;
  photoUrl: string;
  available: boolean;
  notes: string;
  updatedAt: number;
}

export interface Night {
  id: string;
  date: string; // YYYY-MM-DD
  room: number;
  humidity?: number | null;
  outdoor: number; // 7pm–7am average
  outdoorRange?: { min: number; max: number } | null;
  thermo: number;
  door?: Door;
  overnight: number; // model estimate
  items: string[];
  tog: number;
  target?: number;
  rating: number | null; // -2..2
  signs: string[];
  health?: string[];
  note: string;
  morningRoom?: number | null;
  morningHum?: number | null;
  actual?: number | null; // (room + morningRoom)/2, −0.3 if door open
  updatedAt: number;
}

export interface Nap {
  id: string;
  date: string;
  start: string;
  end: string;
  room: number;
  overnight: number; // effective temp
  door: Door;
  outdoor: number | null;
  items: string[];
  tog: number;
  rating: number | null;
  health: string[];
  updatedAt: number;
}

export interface Settings {
  child: string;
  age: number | string; // months
  postcode: string;
  city: string;
  lat: number | string;
  lon: number | string;
  learning: boolean;
  remind: boolean;
  remindAt: string; // HH:MM, Europe/London
  updatedAt: number;
}

export const CATS: { id: Cat; label: string; short: string }[] = [
  { id: 'bag', label: 'Sleeping bag', short: 'Bag' },
  { id: 'suit', label: 'Sleepsuit', short: 'Sleepsuit' },
  { id: 'pjs', label: 'Pyjamas', short: 'PJs' },
  { id: 'body', label: 'Bodysuit / vest', short: 'Base' },
  { id: 'socks', label: 'Socks', short: 'Socks' },
];
export const SLOT_OF: Record<Cat, Slot> = { bag: 'bag', suit: 'mid', pjs: 'mid', body: 'base', socks: 'socks' };
export const SLOTS: { id: Slot; label: string }[] = [
  { id: 'base', label: 'Base layer' },
  { id: 'mid', label: 'Sleepwear' },
  { id: 'bag', label: 'Sleeping bag' },
  { id: 'socks', label: 'Socks' },
];
export const GUIDE: [number, number][] = [[14, 3.5], [16, 3], [18, 2.5], [20, 2], [22, 1.3], [24, 0.9], [26, 0.5], [28, 0.2]];
export const RATINGS = [
  { v: -2, l: 'Too cold', s: '−2' },
  { v: -1, l: 'Bit cool', s: '−1' },
  { v: 0, l: 'Just right', s: '0' },
  { v: 1, l: 'Bit warm', s: '+1' },
  { v: 2, l: 'Too warm', s: '+2' },
];
export const HEALTH = ['Teething', 'Unwell', 'Fever / high temp'];
export const FEVER = 'Fever / high temp';
export const SIGNS = ['Woke in the night', 'Cold hands / chest', 'Sweaty neck', 'Flushed cheeks', 'Kicked about', 'Slept through'];
export const SLEEVES: [Sleeve, string][] = [['short', 'Short'], ['long', 'Long'], ['none', 'None']];
export const LEGS: [Legs, string][] = [['footed', 'Footed'], ['footless', 'Footless'], ['shorts', 'Shorts'], ['na', 'N/A']];
export const TOG_HINT: Record<Cat, string> = {
  bag: 'Use the TOG on the bag’s label.',
  suit: 'Estimate if unlabelled: cotton sleepsuit 0.5, fleece 1.0.',
  pjs: 'Estimate if unlabelled: short PJs 0.3, long cotton PJs 0.5.',
  body: 'Estimate: short-sleeve vest 0.2, long-sleeve 0.3.',
  socks: 'Socks add about 0.1.',
};

/** The prototype's "learningRate" tweak (0–2). */
export const LEARNING_RATE = 1;
/** The prototype's "showAlternatives" tweak. */
export const SHOW_ALTERNATIVES = true;

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  child: 'Our toddler', age: 27, postcode: '', city: 'London', lat: 51.51, lon: -0.13,
  learning: true, remind: true, remindAt: '07:00',
};

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const f1 = (n: number) => r1(n).toFixed(1);
export const sgn = (n: number) => {
  const v = r1(n);
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);
};

/** Guide TOG: linear interpolation through GUIDE, clamped at both ends. */
export function baseTog(t: number): number {
  if (t <= GUIDE[0][0]) return GUIDE[0][1];
  for (let i = 1; i < GUIDE.length; i++) {
    const [a, b] = GUIDE[i - 1], [c, d] = GUIDE[i];
    if (t <= c) return b + (d - b) * (t - a) / (c - a);
  }
  return GUIDE[GUIDE.length - 1][1];
}

/** Overnight room estimate. */
export function overnight(room: number, out: number, thermo: number, door?: Door | string): number {
  const b = Math.min(room, Math.max(thermo - 0.5, room - Math.max(0, room - out) * 0.12));
  return r1(door === 'open' ? b - 0.3 : b);
}

export interface Learnable {
  id: string;
  date: string;
  rating: number | null;
  tog: number;
  door?: string;
  health?: string[];
  actual?: number | null;
  overnight?: number | null;
  room: number;
}

/** Personal learning offset from rated nights (or naps). */
export function learnFrom(list: Learnable[], rate = 1, door?: string | null) {
  const rated = list
    .filter(x => x.rating != null)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  if (!rated.length) return { offset: 0, n: 0, doorN: 0 };
  let pool = rated, doorN = 0;
  if (door) {
    const same = rated.filter(x => (x.door || 'closed') === door);
    if (same.length >= 3 && same.length < rated.length) { pool = same; doorN = same.length; }
  }
  let sw = 0, sr = 0;
  pool.forEach((x, i) => {
    const w = Math.pow(0.8, i) * (x.health && x.health.length ? 0.2 : 1);
    sw += w;
    sr += w * ((x.tog - (x.rating as number) * 0.3) - baseTog((x.actual ?? x.overnight ?? x.room) as number));
  });
  const conf = pool.length / (pool.length + 2);
  return { offset: r1(sr / sw * conf * rate), n: rated.length, doorN };
}

export interface Combo {
  slots: Record<Slot, string | null>;
  total: number;
  score: number;
}

type ComboItem = Pick<Item, 'id' | 'cat' | 'tog' | 'sleeve' | 'available'>;

/** Every bag × base × mid × socks combination, best first. */
export function combos(items: ComboItem[], ov: number, target: number): Combo[] {
  const av = items.filter(i => i.available);
  const by = (s: Slot) => av.filter(i => SLOT_OF[i.cat] === s);
  const bags = by('bag'), bases = [null, ...by('base')], mids = [null, ...by('mid')], socks = [null, ...by('socks')];
  const out: Combo[] = [];
  bags.forEach(bag => bases.forEach(b => mids.forEach(m => socks.forEach(s => {
    if (!b && !m) return;
    const list = [b, m, bag, s].filter(Boolean) as ComboItem[];
    const total = list.reduce((a, i) => a + i.tog, 0);
    const long = [b, m].some(i => i && i.sleeve === 'long');
    let pen = 0;
    if (ov < 19 && !long) pen += 0.3;
    if (ov > 23 && long) pen += 0.3;
    if (s && ov >= 18) pen += 0.2;
    if (b && m && ov > 23) pen += 0.15;
    out.push({
      slots: { base: b ? b.id : null, mid: m ? m.id : null, bag: bag.id, socks: s ? s.id : null },
      total,
      score: Math.abs(total - target) + pen + list.length * 0.02,
    });
  }))));
  return out.sort((a, b) => a.score - b.score);
}

/** Combos with totals more than 0.05 apart (first of each total kept). */
export function distinctTotals(list: Combo[]): Combo[] {
  return list.filter((c, i, arr) => arr.findIndex(d => Math.abs(d.total - c.total) < 0.05) === i);
}

export const clampT = (v: number) => Math.max(0.2, Math.min(4.5, r1(v)));
export const humAdjOf = (humidity: number) => (humidity >= 75 ? -0.2 : humidity >= 65 ? -0.1 : 0);

/** Night "actual" temp from bedtime and morning readings. */
export const actualOf = (room: number, morningRoom: number, door?: string) =>
  r1((room + morningRoom) / 2 + (door === 'open' ? -0.3 : 0));

// ── Forecast helpers ────────────────────────────────────────────────

export interface NightWindow { date: string; avg: number; min: number; max: number }

/** 7pm today → 7am tomorrow (13 hourly values) from an Open-Meteo hourly series. */
export function nightWindow(time: string[], temp: (number | null)[], date: string): NightWindow | null {
  const i = time.indexOf(date + 'T19:00');
  if (i < 0) return null;
  const w = temp.slice(i, i + 13).filter((v): v is number => v != null);
  if (w.length < 6) return null;
  const avg = w.reduce((a, b) => a + b, 0) / w.length;
  return { date, avg: Math.round(avg), min: Math.round(Math.min(...w)), max: Math.round(Math.max(...w)) };
}

export function isoLocal(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function dayLabel(s: string): string {
  return new Date(s + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Sortable, unique id: prefix + ms timestamp + random suffix (newest sorts last). */
export function newId(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}
