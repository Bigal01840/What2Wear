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
  thermo: number | null; // radiator setpoint; null = radiator off
  wind?: number | null; // night (7pm–7am) average wind, km/h
  sun?: number | null; // that day's sunshine, kWh/m² (8am–6pm)
  dayTemp?: number | null; // that day's average outside temp, 9am–6pm
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
  age: number | string; // months (used only if dob is empty)
  dob: string; // YYYY-MM-DD
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
  child: 'Our toddler', age: 27, dob: '', postcode: '', city: 'London', lat: 51.51, lon: -0.13,
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

/** Standard share of the bedtime room–outside gap the room loses, on average, overnight. */
export const DRIFT = 0.12;
/** Wind (km/h, night average) at which the standard drift applies. */
export const WIND_REF = 12;
/** Standard extra cooling per km/h of wind above WIND_REF (2% per km/h). */
export const WIND_COEF = 0.02;

export interface CoolingModel { drift?: number; windCoef?: number; wind?: number | null }

/** Effective drift for a night: windier nights lose heat faster. */
export function driftFor(m: CoolingModel = {}): number {
  const drift = m.drift ?? DRIFT, c = m.windCoef ?? WIND_COEF;
  if (m.wind == null || !isFinite(m.wind)) return drift;
  return drift * Math.max(0.7, Math.min(1.6, 1 + c * (m.wind - WIND_REF)));
}

/** Overnight room estimate. thermo = null means the radiator is off, so nothing stops the drift. */
export function overnight(room: number, out: number, thermo: number | null, door?: Door | string, cooling?: CoolingModel): number {
  const drift = driftFor(cooling);
  const floor = thermo == null ? -Infinity : thermo - 0.5;
  const b = Math.min(room, Math.max(floor, room - Math.max(0, room - out) * drift));
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
const newestFirst = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id));

/** Rated nights, newest first, narrowed to the current door state once 3+ of those are rated. */
function learnPool(list: Learnable[], door?: string | null) {
  const rated = list.filter(x => x.rating != null).sort(newestFirst);
  let pool = rated, doorN = 0;
  if (door) {
    const same = rated.filter(x => (x.door || 'closed') === door);
    if (same.length >= 3 && same.length < rated.length) { pool = same; doorN = same.length; }
  }
  return { rated, pool, doorN };
}
const tempOf = (x: Learnable) => (x.actual ?? x.overnight ?? x.room) as number;
/** What the night says would have been right, minus what the guide said. */
const residual = (x: Learnable) => (x.tog - (x.rating as number) * 0.3) - baseTog(tempOf(x));
const healthW = (x: Learnable) => (x.health && x.health.length ? 0.2 : 1);

/** Personal learning offset from rated nights (or naps): one number for all temperatures. */
export function learnFrom(list: Learnable[], rate = 1, door?: string | null) {
  const { rated, pool, doorN } = learnPool(list, door);
  if (!rated.length) return { offset: 0, n: 0, doorN: 0 };
  let sw = 0, sr = 0;
  pool.forEach((x, i) => {
    const w = Math.pow(0.8, i) * healthW(x);
    sw += w;
    sr += w * residual(x);
  });
  const conf = pool.length / (pool.length + 2);
  return { offset: r1(sr / sw * conf * rate), n: rated.length, doorN };
}

/**
 * Offset for a night at temperature T. Leans on rated nights within a couple of
 * degrees of T (Gaussian, σ = 2°C, slower 0.95 recency decay so last season still
 * counts) and falls back to the overall learnFrom() offset where there is little
 * nearby data. `near` is the effective number of nights close to T.
 */
export function learnAt(list: Learnable[], rate = 1, door: string | null | undefined, T: number) {
  const g = learnFrom(list, rate, door);
  const { pool } = learnPool(list, door);
  let near = 0, sr = 0;
  pool.forEach((x, i) => {
    const w = Math.pow(0.95, i) * healthW(x) * Math.exp(-0.5 * ((tempOf(x) - T) / 2) ** 2);
    near += w;
    sr += w * residual(x);
  });
  if (near < 1e-6) return { ...g, near: 0 };
  const local = (sr / near) * rate;
  const PRIOR = 4; // nearby nights needed before they outweigh the overall offset
  return { offset: r1((near * local + PRIOR * g.offset) / (near + PRIOR)), n: g.n, doorN: g.doorN, near };
}

export interface DriftNight {
  id: string; date: string; room: number; outdoor: number; thermo?: number | null;
  door?: string; morningRoom?: number | null; wind?: number | null;
}

/**
 * Learns how this nursery cools, from nights with a morning reading:
 *  - drift: the share of the bedtime room–outside gap lost on average overnight
 *    (starts at the standard 0.12, weighted least squares with a prior worth two
 *    typical nights);
 *  - windCoef: how much faster it cools per km/h of night wind above 12 km/h
 *    (starts at 2%/km/h, learned from nights with a wind record).
 * Nights where the radiator was holding the room up are skipped, and so are
 * mild nights (gap < 3°) that say little.
 */
export function learnDrift(list: DriftNight[]): { drift: number; windCoef: number; n: number; nWind: number } {
  const use = list.filter(x => {
    if (x.morningRoom == null || !isFinite(x.morningRoom) || !isFinite(x.outdoor)) return false;
    if (x.room - x.outdoor < 3) return false;
    const avg = (x.room + x.morningRoom) / 2;
    return x.thermo == null || avg > x.thermo - 0.5 + 0.2;
  }).sort(newestFirst);
  const dropOf = (x: DriftNight) => x.room - (x.room + (x.morningRoom as number)) / 2 - (x.door === 'open' ? 0.3 : 0);
  const windMul = (x: DriftNight, c: number) => (x.wind == null ? 1 : Math.max(0.7, Math.min(1.6, 1 + c * (x.wind - WIND_REF))));

  // 1. drift, with each night's drop scaled back to a 12 km/h night using the standard wind effect
  const PRIOR = 2 * 8 * 8; // two nights with an 8° gap
  let sxy = PRIOR * DRIFT, sxx = PRIOR;
  use.forEach((x, i) => {
    const w = Math.pow(0.9, i), gap = x.room - x.outdoor;
    sxy += w * (dropOf(x) / windMul(x, WIND_COEF)) * gap;
    sxx += w * gap * gap;
  });
  const drift = Math.max(0.02, Math.min(0.4, sxy / sxx));

  // 2. wind sensitivity from what's left over on nights with a wind record
  const windy = use.filter(x => x.wind != null);
  const PC = 2 * 10 * 10; // two nights 10 km/h from the reference
  let cxy = PC * WIND_COEF, cxx = PC;
  windy.forEach((x, i) => {
    const w = Math.pow(0.9, i), gap = x.room - x.outdoor, dx = (x.wind as number) - WIND_REF;
    cxy += w * dx * (dropOf(x) / (gap * drift) - 1);
    cxx += w * dx * dx;
  });
  const windCoef = Math.max(0, Math.min(0.06, cxy / cxx));
  return { drift: Math.round(drift * 1000) / 1000, windCoef: Math.round(windCoef * 1000) / 1000, n: use.length, nWind: windy.length };
}

// ── Daytime sun and temperature → bedtime room (for forecast nights) ──

/** Standard bedtime warming per kWh/m² of daytime sun, and per °C of daytime outside temp. */
export const SUN_COEF = 0.25;
export const DAYTEMP_COEF = 0.15;

export interface BedtimeNight {
  id: string; date: string; room: number; thermo?: number | null; sun?: number | null; dayTemp?: number | null;
}

/**
 * Learns how much daytime sun and outside warmth raise the nursery at bedtime,
 * from logged nights that recorded them (skipping nights the radiator was
 * holding the room). Ridge regression on centred data, pulled towards the
 * standard coefficients until there's enough spread in the data.
 */
export function learnBedtime(list: BedtimeNight[]): { sunCoef: number; tempCoef: number; n: number } {
  const use = list.filter(x => x.sun != null && x.dayTemp != null && isFinite(x.room) && (x.thermo == null || x.room > x.thermo + 0.3))
    .sort(newestFirst);
  if (use.length < 3) return { sunCoef: SUN_COEF, tempCoef: DAYTEMP_COEF, n: use.length };
  const ws = use.map((_, i) => Math.pow(0.95, i));
  const W = ws.reduce((a, b) => a + b, 0);
  const mean = (f: (x: BedtimeNight) => number) => use.reduce((a, x, i) => a + ws[i] * f(x), 0) / W;
  const ms = mean(x => x.sun as number), mt = mean(x => x.dayTemp as number), mr = mean(x => x.room);
  const P1 = 2 * 2 * 2, P2 = 2 * 4 * 4; // priors: two days 2 kWh / 4° from average
  let a11 = P1, a12 = 0, a22 = P2, b1 = P1 * SUN_COEF, b2 = P2 * DAYTEMP_COEF;
  use.forEach((x, i) => {
    const s1 = (x.sun as number) - ms, t1 = (x.dayTemp as number) - mt, y = x.room - mr, w = ws[i];
    a11 += w * s1 * s1; a12 += w * s1 * t1; a22 += w * t1 * t1; b1 += w * s1 * y; b2 += w * t1 * y;
  });
  const det = a11 * a22 - a12 * a12;
  const sun = (b1 * a22 - b2 * a12) / det, temp = (a11 * b2 - a12 * b1) / det;
  return {
    sunCoef: Math.round(Math.max(0, Math.min(1.5, sun)) * 100) / 100,
    tempCoef: Math.round(Math.max(0, Math.min(0.6, temp)) * 100) / 100,
    n: use.length,
  };
}

export interface DayWeather { sun: number | null; dayTemp: number | null }

/** Bedtime room for a future night: tonight's room, moved by the difference in daytime sun and warmth. */
export function bedtimeRoom(room: number, today: DayWeather, day: DayWeather,
  m: { sunCoef: number; tempCoef: number }, thermo: number | null): number {
  let delta = 0;
  if (today.sun != null && day.sun != null) delta += m.sunCoef * (day.sun - today.sun);
  if (today.dayTemp != null && day.dayTemp != null) delta += m.tempCoef * (day.dayTemp - today.dayTemp);
  const r = room + Math.max(-3, Math.min(3, delta));
  return r1(thermo == null ? r : Math.max(r, Math.min(room, thermo - 0.5)));
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

export interface NightWindow { date: string; avg: number; min: number; max: number; wind?: number | null }

const meanOf = (v: (number | null)[]) => { const w = v.filter((x): x is number => x != null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; };

/** 7pm today → 7am tomorrow (13 hourly values) from an Open-Meteo hourly series. */
export function nightWindow(time: string[], temp: (number | null)[], date: string, wind?: (number | null)[] | null): NightWindow | null {
  const i = time.indexOf(date + 'T19:00');
  if (i < 0) return null;
  const w = temp.slice(i, i + 13).filter((v): v is number => v != null);
  if (w.length < 6) return null;
  const avg = w.reduce((a, b) => a + b, 0) / w.length;
  const wa = wind ? meanOf(wind.slice(i, i + 13)) : null;
  return { date, avg: Math.round(avg), min: Math.round(Math.min(...w)), max: Math.round(Math.max(...w)), wind: wa == null ? null : Math.round(wa) };
}

/** Daytime sun (kWh/m², 8am–6pm) and average outside temperature (9am–6pm) for a date. */
export function dayWeather(time: string[], temp: (number | null)[], rad: (number | null)[] | null | undefined, date: string): DayWeather {
  const idx = (h: number) => time.indexOf(`${date}T${String(h).padStart(2, '0')}:00`);
  const i9 = idx(9), i8 = idx(8);
  const dayTemp = i9 >= 0 ? meanOf(temp.slice(i9, i9 + 10)) : null;
  let sun: number | null = null;
  if (rad && i8 >= 0) {
    const v = rad.slice(i8 + 1, i8 + 11); // values at 09:00…18:00 cover the hours 08–18
    if (v.filter(x => x != null).length >= 8) sun = Math.round(v.reduce<number>((a, x) => a + (x ?? 0), 0) / 100) / 10;
  }
  return { sun, dayTemp: dayTemp == null ? null : Math.round(dayTemp * 10) / 10 };
}

/** Whole months from a YYYY-MM-DD birth date to `now`. */
export function ageMonths(dob: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return null;
  let months = (now.getFullYear() - +m[1]) * 12 + (now.getMonth() + 1 - +m[2]);
  if (now.getDate() < +m[3]) months--;
  return Math.max(0, months);
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
