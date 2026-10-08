// Open-Meteo (Met Office UKV via ukmo_seamless, with a fallback) and postcodes.io.
// Used by the server proxy, and called directly from the phone in local mode.

export interface Forecast {
  source: 'Met Office' | 'Open-Meteo';
  time: string[];
  temperature_2m: (number | null)[];
  fetchedAt: number;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!r.ok && r.status !== 404) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const url = (m?: string) =>
    `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m&forecast_days=5&timezone=auto${m ? '&models=' + m : ''}`;
  const ok = (j: any) => j && j.hourly && Array.isArray(j.hourly.temperature_2m) && j.hourly.temperature_2m.some((v: unknown) => v != null);
  let source: Forecast['source'] = 'Met Office';
  let j: any = null;
  try { j = await getJson(url('ukmo_seamless')); } catch { j = null; }
  if (!ok(j)) { source = 'Open-Meteo'; j = await getJson(url()); }
  if (!ok(j)) throw new Error('no usable forecast');
  return { source, time: j.hourly.time, temperature_2m: j.hourly.temperature_2m, fetchedAt: Date.now() };
}

export function fetchPostcode(pc: string): Promise<any> {
  const norm = pc.replace(/\s+/g, '').toUpperCase();
  return getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(norm));
}
