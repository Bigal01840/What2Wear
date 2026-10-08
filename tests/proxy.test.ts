import { afterEach, describe, expect, it, vi } from 'vitest';
import { nightWindow } from '../shared/model.ts';

const hourly = (vals: (number | null)[]) => ({
  hourly: { time: vals.map((_, i) => `2026-01-15T${String(i % 24).padStart(2, '0')}:00`), temperature_2m: vals },
});

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('weather proxy', () => {
  it('uses ukmo_seamless when it has values, and caches for 30 minutes', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(hourly([5, 6, 7]))));
    vi.stubGlobal('fetch', fetch);
    const { weather } = await import('../server/proxy.ts');
    const a = await weather(51.5123, -0.1299);
    expect(a.source).toBe('Met Office');
    expect(String((fetch.mock.calls[0] as any[])[0])).toContain('models=ukmo_seamless');
    expect(String((fetch.mock.calls[0] as any[])[0])).toContain('latitude=51.51&longitude=-0.13');
    await weather(51.51, -0.13);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default model when ukmo has no usable values', async () => {
    const fetch = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes('models=') ? hourly([null, null]) : hourly([3, 4]))));
    vi.stubGlobal('fetch', fetch);
    const { weather } = await import('../server/proxy.ts');
    const w = await weather(52, -1);
    expect(w.source).toBe('Open-Meteo');
    expect(w.temperature_2m).toEqual([3, 4]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String((fetch.mock.calls[1] as any[])[0])).not.toContain('models=');
  });

  it('falls back when the ukmo request fails outright', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('models=')) throw new TypeError('network');
      return new Response(JSON.stringify(hourly([3])));
    });
    vi.stubGlobal('fetch', fetch);
    const { weather } = await import('../server/proxy.ts');
    expect((await weather(53, -2)).source).toBe('Open-Meteo');
  });

  it('caches postcode lookups', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: 200, result: { postcode: 'SW1A 1AA' } })));
    vi.stubGlobal('fetch', fetch);
    const { postcode } = await import('../server/proxy.ts');
    await postcode('sw1a 1aa');
    await postcode('SW1A1AA');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('nightWindow()', () => {
  const time: string[] = [], temp: number[] = [];
  for (let d = 15; d <= 16; d++) for (let h = 0; h < 24; h++) {
    time.push(`2026-01-${d}T${String(h).padStart(2, '0')}:00`);
    temp.push(h >= 19 || h <= 7 ? 4 + (h % 3) : 12);
  }
  it('averages the 13 hourly values from 19:00 to 07:00', () => {
    const w = nightWindow(time, temp, '2026-01-15')!;
    const vals = temp.slice(19, 32);
    expect(vals).toHaveLength(13);
    expect(w).toEqual({ date: '2026-01-15', avg: Math.round(vals.reduce((a, b) => a + b) / 13), min: 4, max: 6 });
  });
  it('returns null without enough data', () => {
    expect(nightWindow(time, temp, '2026-01-16')).toBeNull(); // only 5 hours left
    expect(nightWindow(time, temp, '2026-02-01')).toBeNull();
  });
});
