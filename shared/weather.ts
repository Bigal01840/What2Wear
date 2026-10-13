// Open-Meteo (Met Office UKV via ukmo_seamless, with a fallback) and postcodes.io.
// Used by the server proxy, and called directly from the phone in local mode.

export interface Forecast {
  source: 'Met Office' | 'Open-Meteo';
  time: string[];
  temperature_2m: (number | null)[];
  /** km/h at 10 m */
  wind_speed_10m: (number | null)[] | null;
  /** W/m², mean over the preceding hour */
  shortwave_radiation: (number | null)[] | null;
  fetchedAt: number;
}

const VARS = 'temperature_2m,wind_speed_10m,shortwave_radiation';

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!r.ok && r.status !== 404) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

const has = (j: any, k: string) => !!j && !!j.hourly && Array.isArray(j.hourly[k]) && j.hourly[k].some((v: unknown) => v != null);

/** Values of `k` from `src`, lined up with `time` (null where src has no matching hour). */
function align(time: string[], src: any, k: string): (number | null)[] | null {
  if (!has(src, k)) return null;
  const at = new Map<string, number | null>(src.hourly.time.map((t: string, i: number) => [t, src.hourly[k][i]]));
  return time.map(t => at.get(t) ?? null);
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const url = (m?: string) =>
    `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=${VARS}&forecast_days=5&timezone=auto${m ? '&models=' + m : ''}`;
  let source: Forecast['source'] = 'Met Office';
  let j: any = null, fallback: any = null;
  try { j = await getJson(url('ukmo_seamless')); } catch { j = null; }
  if (!has(j, 'temperature_2m')) { source = 'Open-Meteo'; j = await getJson(url()); fallback = j; }
  if (!has(j, 'temperature_2m')) throw new Error('no usable forecast');
  // Fill wind / sun from the default model if the Met Office series lacks them.
  if (!fallback && (!has(j, 'wind_speed_10m') || !has(j, 'shortwave_radiation'))) {
    try { fallback = await getJson(url()); } catch { fallback = null; }
  }
  const time: string[] = j.hourly.time;
  return {
    source, time, temperature_2m: j.hourly.temperature_2m,
    wind_speed_10m: align(time, j, 'wind_speed_10m') ?? align(time, fallback, 'wind_speed_10m'),
    shortwave_radiation: align(time, j, 'shortwave_radiation') ?? align(time, fallback, 'shortwave_radiation'),
    fetchedAt: Date.now(),
  };
}

export function fetchPostcode(pc: string): Promise<any> {
  const norm = pc.replace(/\s+/g, '').toUpperCase();
  return getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(norm));
}
