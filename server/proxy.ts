// Proxies for postcodes.io and Open-Meteo, cached in memory for 30 minutes.
import { fetchForecast, fetchPostcode, type Forecast } from '../shared/weather.ts';

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

export type Weather = Forecast;

export function weather(lat: number, lon: number): Promise<Weather> {
  return cached(`wx:${lat.toFixed(2)},${lon.toFixed(2)}`, () => fetchForecast(lat, lon));
}

export function postcode(pc: string): Promise<any> {
  return cached(`pc:${pc.replace(/\s+/g, '').toUpperCase()}`, () => fetchPostcode(pc));
}
