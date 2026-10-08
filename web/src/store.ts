// App state, IndexedDB cache and write-through sync with the server.
//
// The server is the source of truth. Every change is applied locally first,
// cached in IndexedDB and queued in an outbox; the outbox is flushed to the API
// whenever we're online. Records carry updatedAt and the server keeps the most
// recent write (last-write-wins), which is plenty for two parents.
import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import {
  DEFAULT_SETTINGS, isoLocal, nightWindow,
  type Door, type Item, type Nap, type Night, type NightWindow, type Settings, type Slot,
} from '../../shared/model.ts';
import { fetchForecast, fetchPostcode } from '../../shared/weather.ts';
import { LOCAL } from './config.ts';

export type Tab = 'tonight' | 'forecast' | 'nap' | 'morning' | 'wardrobe' | 'history';
export const TABS: Tab[] = ['tonight', 'forecast', 'nap', 'morning', 'wardrobe', 'history'];

export interface Data { settings: Settings; items: Item[]; nights: Night[]; naps: Nap[] }

/** Bedtime inputs, kept per phone like the prototype kept them per browser. */
export interface Device {
  room: number; humidity: number; outdoor: number; thermo: number; radiator: boolean; door: Door;
  napStart: string; napEnd: string; napRoom: number; napDoor: Door;
}

export interface Wx {
  status: 'idle' | 'loading' | 'ok' | 'fail';
  src: string;
  hourly: { time: string[]; temp: (number | null)[] } | null;
  outdoorAuto: boolean;
  outdoorRange: { min: number; max: number } | null;
  fcNights: NightWindow[];
}

export interface ItemDraft extends Omit<Item, 'tog' | 'updatedAt'> { tog: string; updatedAt?: number; uploading?: boolean }
export interface NightDraft {
  id: string; date: string; room: string; humidity: string; outdoor: string; thermo: string;
  morningRoom: string; morningHum: string; door: Door; slots: Record<Slot, string>;
  rating: number | null; health: string[]; signs: string[]; note: string;
}
export interface Fb { rating: number | null; signs: string[]; note: string; health?: string[]; mRoom?: number; mHum?: number }

export interface Ui {
  tab: Tab;
  overrides: Partial<Record<Slot, string | null>>;
  health: string[];
  fb: Fb;
  draft: ItemDraft | null; draftErr: string;
  nightDraft: NightDraft | null; ndErr: string;
  catFilter: string;
  napPick: number; napRating: number | null;
  sheet: boolean;
  toast: string;
  learnMsg: string;
  notif: boolean;
  pcMsg: string; pcErr: boolean;
}

export interface State {
  auth: 'unknown' | 'in' | 'out';
  loaded: boolean;
  data: Data;
  device: Device;
  wx: Wx;
  ui: Ui;
}

type Kind = 'items' | 'nights' | 'naps';
interface Op { key: string; kind: Kind | 'settings'; id?: string; method: 'put' | 'delete'; body?: unknown; updatedAt: number }

const tabFromPath = (p: string): Tab => {
  const t = p.replace(/^\/+|\/+$/g, '') as Tab;
  return TABS.includes(t) ? t : 'tonight';
};

const initial: State = {
  auth: 'unknown',
  loaded: false,
  data: { settings: { ...DEFAULT_SETTINGS, updatedAt: 0 }, items: [], nights: [], naps: [] },
  device: { room: 20.5, humidity: 55, outdoor: 9, thermo: 18, radiator: true, door: 'closed', napStart: '12:30', napEnd: '14:30', napRoom: 21, napDoor: 'closed' },
  wx: { status: 'idle', src: '', hourly: null, outdoorAuto: false, outdoorRange: null, fcNights: [] },
  ui: {
    tab: tabFromPath(location.pathname), overrides: {}, health: [], fb: { rating: null, signs: [], note: '' },
    draft: null, draftErr: '', nightDraft: null, ndErr: '', catFilter: 'all', napPick: 0, napRating: null,
    sheet: false, toast: '', learnMsg: '', notif: false, pcMsg: '', pcErr: false,
  },
};

let state = initial;
const listeners = new Set<() => void>();
let outbox: Op[] = [];

function emit() { listeners.forEach(l => l()); }
function setState(fn: (s: State) => Partial<State>) { state = { ...state, ...fn(state) }; emit(); }

export const store = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get);
}

// ── UI ──────────────────────────────────────────────────────────────

export function setUi(patch: Partial<Ui> | ((u: Ui) => Partial<Ui>)) {
  setState(s => ({ ui: { ...s.ui, ...(typeof patch === 'function' ? patch(s.ui) : patch) } }));
}

export function setTab(tab: Tab, patch: Partial<Ui> = {}) {
  const path = tab === 'tonight' ? '/' : '/' + tab;
  if (location.pathname !== path) history.pushState(null, '', path);
  setUi({ tab, ...patch });
  document.querySelector('.scr-main')?.scrollTo(0, 0);
}
window.addEventListener('popstate', () => setUi({ tab: tabFromPath(location.pathname) }));

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function flash(msg: string) {
  clearTimeout(toastTimer);
  setUi({ toast: msg });
  toastTimer = setTimeout(() => setUi({ toast: '' }), 2400);
}

export function setDevice(patch: Partial<Device>) {
  setState(s => ({ device: { ...s.device, ...patch } }));
  set('device', state.device).catch(() => {});
}

// ── API ─────────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(public status: number, public body: any) { super('HTTP ' + status); }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); (init.headers as any)['content-type'] = 'application/json'; }
  const r = await fetch(url, init);
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !url.endsWith('/login')) setState(() => ({ auth: 'out' }));
  if (!r.ok) throw new HttpError(r.status, j);
  return j as T;
}

// ── Sync ────────────────────────────────────────────────────────────

function applyOp(d: Data, op: Op): Data {
  if (op.kind === 'settings') return { ...d, settings: { ...d.settings, ...(op.body as Settings) } };
  const list = d[op.kind] as any[];
  const without = list.filter(x => x.id !== op.id);
  return { ...d, [op.kind]: op.method === 'delete' ? without : [...without, op.body] };
}

function persist() {
  set('data', state.data).catch(() => {});
  set('outbox', outbox).catch(() => {});
}

function enqueue(op: Op) {
  if (LOCAL) {
    // No server: this phone's IndexedDB is the only copy.
    setState(s => ({ data: applyOp(s.data, op) }));
    set('data', state.data).catch(() => {});
    return;
  }
  outbox = outbox.filter(o => o.key !== op.key).concat(op);
  setState(s => ({ data: applyOp(s.data, op) }));
  persist();
  scheduleFlush(op.kind === 'settings' ? 600 : 0);
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush(delay: number) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush().catch(() => {}); }, delay);
}

let flushing: Promise<boolean> | null = null;
/** Send queued writes. Resolves true when the outbox is empty. */
export function flush(): Promise<boolean> {
  if (flushing) return flushing;
  const run = (async () => {
    {
      while (outbox.length) {
        const op = outbox[0];
        try {
          if (op.kind === 'settings') await api('PUT', '/api/settings', { ...state.data.settings });
          else if (op.method === 'delete') await api('DELETE', `/api/${op.kind}/${encodeURIComponent(op.id!)}?updatedAt=${op.updatedAt}`);
          else await api('PUT', `/api/${op.kind}/${encodeURIComponent(op.id!)}`, op.body);
        } catch (e) {
          // Network down or signed out: keep the op and try again later.
          if (!(e instanceof HttpError) || e.status === 401 || e.status >= 500) return false;
          console.warn('Dropping rejected write', op, e.body); // 4xx: the server will never accept it
        }
        if (outbox[0] === op) outbox = outbox.slice(1);
        else outbox = outbox.filter(o => o !== op);
        set('outbox', outbox).catch(() => {});
      }
      return true;
    }
  })();
  // Clear the lock only after assigning it (run may already have settled).
  flushing = run.finally(() => { flushing = null; });
  return flushing;
}

/** Push pending writes, then pull the shared state. */
export async function refresh() {
  if (LOCAL) return true;
  try {
    await flush();
    const j = await api<Data & { serverTime: number }>('GET', '/api/state');
    let d: Data = { settings: j.settings, items: j.items, nights: j.nights, naps: j.naps };
    for (const op of outbox) d = applyOp(d, op); // writes made while we were fetching
    const prevLoc = `${state.data.settings.lat},${state.data.settings.lon}`;
    setState(() => ({ data: d, auth: 'in', loaded: true }));
    set('data', d).catch(() => {});
    if (`${d.settings.lat},${d.settings.lon}` !== prevLoc) fetchWeather();
    return true;
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return false;
    // Offline: keep showing the cached copy.
    setState(s => ({ loaded: true, auth: s.auth === 'unknown' ? 'in' : s.auth }));
    return false;
  }
}

export function saveRecord(kind: Kind, rec: Item | Night | Nap) {
  const r = { ...rec, updatedAt: Date.now() };
  enqueue({ key: `${kind}:${rec.id}`, kind, id: rec.id, method: 'put', body: r, updatedAt: r.updatedAt });
  return r;
}

export function deleteRecord(kind: Kind, id: string) {
  enqueue({ key: `${kind}:${id}`, kind, id, method: 'delete', updatedAt: Date.now() });
}

export function saveSettings(patch: Partial<Settings>) {
  const updatedAt = Date.now();
  enqueue({ key: 'settings', kind: 'settings', method: 'put', body: { ...patch, updatedAt }, updatedAt });
}

// ── Weather & postcode ──────────────────────────────────────────────

function applyWeather(src: string, time: string[], temp: (number | null)[]): boolean {
  const t0 = nightWindow(time, temp, isoLocal(new Date()));
  if (!t0) return false;
  const fc = [1, 2, 3].map(k => { const d = new Date(); d.setDate(d.getDate() + k); return nightWindow(time, temp, isoLocal(d)); })
    .filter((x): x is NightWindow => !!x);
  setState(s => ({
    wx: { status: 'ok', src, hourly: { time, temp }, outdoorAuto: true, outdoorRange: { min: t0.min, max: t0.max }, fcNights: fc },
    device: { ...s.device, outdoor: t0.avg },
  }));
  set('device', state.device).catch(() => {});
  return true;
}

export async function fetchWeather() {
  const { lat, lon } = state.data.settings;
  setState(s => ({ wx: { ...s.wx, status: 'loading' } }));
  try {
    const j = LOCAL
      ? await fetchForecast(Number(lat), Number(lon))
      : await api<{ source: string; time: string[]; temperature_2m: (number | null)[] }>(
        'GET', `/api/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`);
    if (!applyWeather(j.source, j.time, j.temperature_2m)) throw new Error('no window for tonight');
    set('wx', { src: j.source, time: j.time, temp: j.temperature_2m, lat, lon }).catch(() => {});
  } catch {
    // Offline: fall back to the last forecast we saved, if it still covers tonight.
    const c = await get('wx').catch(() => null);
    if (!(c && c.lat === lat && c.lon === lon && applyWeather(c.src, c.time, c.temp))) {
      setState(s => ({ wx: { ...s.wx, status: 'fail', outdoorAuto: false } }));
    }
  }
}

export async function lookupPostcode() {
  const pc = String(state.data.settings.postcode || '').trim().toUpperCase();
  if (!pc) return setUi({ pcMsg: 'Enter a postcode first.', pcErr: true });
  setUi({ pcMsg: 'Looking up…', pcErr: false });
  try {
    const j = LOCAL ? await fetchPostcode(pc) : await api('GET', '/api/postcode/' + encodeURIComponent(pc));
    if (j.status !== 200 || !j.result) throw 0;
    const x = j.result;
    const city = x.admin_district || x.parish || x.region || pc;
    saveSettings({ postcode: x.postcode, lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100, city });
    setUi({ pcMsg: `Found ${x.postcode} · ${city}`, pcErr: false });
    fetchWeather();
  } catch {
    setUi({ pcMsg: 'Postcode not found. Check it, or enter lat/lon by hand.', pcErr: true });
  }
}

// ── Boot ────────────────────────────────────────────────────────────

export async function login(passcode: string): Promise<string | null> {
  try {
    await api('POST', '/api/login', { passcode });
    setState(() => ({ auth: 'in' }));
    await refresh();
    fetchWeather();
    return null;
  } catch (e) {
    if (e instanceof HttpError) return e.body?.error || 'Couldn’t sign in.';
    return 'Can’t reach the server. Check you’re connected to Tailscale.';
  }
}

export async function boot() {
  if (LOCAL) return bootLocal();
  const [data, device, ob] = await Promise.all([get('data'), get('device'), get('outbox')]).catch(() => [null, null, null]);
  outbox = Array.isArray(ob) ? ob : [];
  setState(s => ({
    data: data ? { ...s.data, ...data, settings: { ...s.data.settings, ...data.settings } } : s.data,
    device: device ? { ...s.device, ...device } : s.device,
    // With a cached copy we can render straight away, even offline.
    loaded: !!data,
    auth: data ? 'in' : 'unknown',
  }));
  const ok = await refresh();
  if (!ok && state.auth !== 'out' && !data) {
    // No cache and no server: ask whether we're signed in at all.
    try { const j = await api('GET', '/api/session'); setState(() => ({ auth: j.ok ? 'in' : 'out', loaded: true })); }
    catch { setState(() => ({ loaded: true })); }
  }
  if (state.auth !== 'out') fetchWeather();

  window.addEventListener('online', () => { refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.auth === 'in') refresh(); });
  setInterval(() => { if (document.visibilityState === 'visible' && state.auth === 'in') refresh(); }, 60_000);
}

export function setWx(patch: Partial<Wx>) {
  setState(s => ({ wx: { ...s.wx, ...patch } }));
}

// ── Local mode ──────────────────────────────────────────────────────

async function bootLocal() {
  const [data, device] = await Promise.all([get('data'), get('device')]).catch(() => [null, null]);
  setState(s => ({
    data: data ? { ...s.data, ...data, settings: { ...s.data.settings, ...data.settings } } : s.data,
    device: device ? { ...s.device, ...device } : s.device,
    loaded: true,
    auth: 'in',
  }));
  // Ask the browser not to evict our storage under pressure.
  navigator.storage?.persist?.().catch(() => {});
  fetchWeather();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.wx.status !== 'loading') fetchWeather();
  });
}

// ── Backup file (Export / Import) ───────────────────────────────────

export interface Backup {
  app: 'sleep-outfit';
  version: 1;
  exportedAt: string;
  data: Data;
  device: Device;
}

export function makeBackup(): Backup {
  return { app: 'sleep-outfit', version: 1, exportedAt: new Date().toISOString(), data: state.data, device: state.device };
}

/** Parses a backup file; throws a readable message if it isn't one. */
export function parseBackup(text: string): Backup {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('That file isn’t a Sleep Outfit backup.'); }
  const d = j && j.data;
  if (!j || j.app !== 'sleep-outfit' || !d || !Array.isArray(d.items) || !Array.isArray(d.nights) || !Array.isArray(d.naps) || !d.settings) {
    throw new Error('That file isn’t a Sleep Outfit backup.');
  }
  return j as Backup;
}

/** Replaces everything on this phone with the backup. */
export async function restoreBackup(b: Backup) {
  const data: Data = {
    settings: { ...DEFAULT_SETTINGS, ...b.data.settings },
    items: b.data.items, nights: b.data.nights, naps: b.data.naps,
  };
  setState(s => ({
    data,
    device: b.device ? { ...s.device, ...b.device } : s.device,
    ui: { ...s.ui, overrides: {}, fb: { rating: null, signs: [], note: '' }, learnMsg: '' },
  }));
  await set('data', state.data);
  await set('device', state.device);
  fetchWeather();
}
