// Proxies for postcodes.io and Open-Meteo, cached in memory for 30 minutes.

const TTL = 30 * 60e3;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) {
    for (const [k, v] of cache) if (Date.now() - v.at >= TTL) cache.delete(k);
  }
  return value;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!r.ok && r.status !== 404) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

export interface Weather {
  source: 'Met Office' | 'Open-Meteo';
  time: string[];
  temperature_2m: (number | null)[];
  fetchedAt: number;
}

export function weather(lat: number, lon: number): Promise<Weather> {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  return cached(`wx:${la},${lo}`, async () => {
    const url = (m?: string) =>
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m&forecast_days=5&timezone=auto${m ? '&models=' + m : ''}`;
    const ok = (j: any) => j && j.hourly && Array.isArray(j.hourly.temperature_2m) && j.hourly.temperature_2m.some((v: unknown) => v != null);
    let source: Weather['source'] = 'Met Office';
    let j: any = null;
    try { j = await getJson(url('ukmo_seamless')); } catch { j = null; }
    if (!ok(j)) { source = 'Open-Meteo'; j = await getJson(url()); }
    if (!ok(j)) throw new Error('no usable forecast');
    return { source, time: j.hourly.time, temperature_2m: j.hourly.temperature_2m, fetchedAt: Date.now() };
  });
}

export function postcode(pc: string): Promise<any> {
  const norm = pc.replace(/\s+/g, '').toUpperCase();
  return cached(`pc:${norm}`, () => getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(norm)));
}
