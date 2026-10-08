import { describe, expect, it } from 'vitest';
import { ageMonths, baseTog, clampT, combos, distinctTotals, learnFrom, overnight, r1, type Item } from '../shared/model.ts';
import { seed } from '../shared/seed.ts';

const S = seed(new Date('2026-01-15T21:00:00'));

describe('baseTog()', () => {
  it('hits every guide point', () => {
    expect(baseTog(14)).toBe(3.5);
    expect(baseTog(16)).toBe(3);
    expect(baseTog(18)).toBe(2.5);
    expect(baseTog(20)).toBe(2);
    expect(baseTog(22)).toBe(1.3);
    expect(baseTog(24)).toBe(0.9);
    expect(baseTog(26)).toBe(0.5);
    expect(baseTog(28)).toBe(0.2);
  });
  it('interpolates linearly between points', () => {
    expect(baseTog(17)).toBeCloseTo(2.75, 10);
    expect(baseTog(21)).toBeCloseTo(1.65, 10);
    expect(baseTog(19.4)).toBeCloseTo(2.15, 10);
  });
  it('clamps at both ends', () => {
    expect(baseTog(10)).toBe(3.5);
    expect(baseTog(-5)).toBe(3.5);
    expect(baseTog(30)).toBe(0.2);
  });
});

describe('overnight()', () => {
  it('drifts 12% of the gap to the outside average (seed nights)', () => {
    expect(S.nights.map(n => n.overnight)).toEqual([19.9, 18.8, 18, 18.6, 19.4, 18.7]);
  });
  it('matches the seed bedtime defaults', () => {
    expect(overnight(S.room, S.outdoor, S.thermo, 'closed')).toBe(19.1);
  });
  it('never falls below thermostat − 0.5', () => {
    expect(overnight(20, -10, 19, 'closed')).toBe(18.5);
  });
  it('never rises above the room when it is warmer outside', () => {
    expect(overnight(20, 25, 18, 'closed')).toBe(20);
  });
  it('has no thermostat floor with the radiator off', () => {
    expect(overnight(20, -10, null, 'closed')).toBe(16.4); // 20 − 30 × 0.12
    expect(overnight(20, -10, null, 'open')).toBe(16.1);
    expect(overnight(20, 25, null, 'closed')).toBe(20);
  });
  it('runs 0.3° cooler with the door open', () => {
    expect(overnight(21, 12, 18, 'open')).toBe(19.6);
    expect(overnight(20, -10, 19, 'open')).toBe(18.2);
  });
});

describe('learnFrom()', () => {
  it('learns a −0.2 offset from the seed nights', () => {
    // 5 rated nights; residuals −0.35, −0.35, −0.30, −0.30, −0.325 (newest first)
    expect(learnFrom(S.nights)).toEqual({ offset: -0.2, n: 5, doorN: 0 });
  });
  it('scales by the learning rate', () => {
    expect(learnFrom(S.nights, 0).offset).toBeCloseTo(0, 10);
    expect(learnFrom(S.nights, 2).offset).toBe(-0.5);
  });
  it('returns zero with nothing rated', () => {
    expect(learnFrom(S.nights.map(n => ({ ...n, rating: null })))).toEqual({ offset: 0, n: 0, doorN: 0 });
  });
  it('weights nights with a health marker at 20%', () => {
    const base = learnFrom(S.nights).offset;
    // Mark the newest rated night (−0.35 residual) as teething: others dominate, still rounds to −0.2
    const marked = S.nights.map((n, i) => (i === 4 ? { ...n, health: ['Teething'] } : n));
    expect(learnFrom(marked).offset).toBe(base);
    // A sick night rated "too warm" barely moves things
    const sick = [...S.nights, { ...S.nights[4], id: 'sick', date: '2026-01-15', rating: 2, health: ['Fever / high temp'] }];
    const healthy = [...S.nights, { ...S.nights[4], id: 'sick', date: '2026-01-15', rating: 2 }];
    expect(Math.abs(learnFrom(sick).offset - base)).toBeLessThan(Math.abs(learnFrom(healthy).offset - base));
  });
  it('uses only same-door nights once 3+ are rated', () => {
    const nights = S.nights.map((n, i) => (i < 3 ? { ...n, door: 'open' as const } : n));
    const open = learnFrom(nights, 1, 'open');
    expect(open.doorN).toBe(3);
    expect(open.n).toBe(5);
    expect(learnFrom(nights.slice(0, 3), 1, null).offset).toBe(open.offset);
    // only 2 closed rated nights → falls back to every night
    expect(learnFrom(nights, 1, 'closed')).toEqual({ ...learnFrom(nights), doorN: 0 });
  });
  it('prefers actual, then overnight, then room', () => {
    const one = [{ id: 'a', date: '2026-01-01', rating: 0, tog: 2, room: 22, overnight: 21, actual: 20 }];
    expect(learnFrom(one).offset).toBe(0); // ideal 2 − guide(20)=2
    expect(learnFrom([{ ...one[0], actual: null }]).offset).toBe(r1((2 - 1.65) / 3));
    expect(learnFrom([{ ...one[0], actual: null, overnight: null }]).offset).toBe(r1((2 - 1.3) / 3));
  });
});

describe('combos()', () => {
  const ov = overnight(S.room, S.outdoor, S.thermo, 'closed'); // 19.1
  const target = clampT(baseTog(ov) + learnFrom(S.nights).offset + 0);
  const list = combos(S.items, ov, target);
  const byId = (id: string | null) => S.items.find(i => i.id === id) as Item;

  it('targets 2.0 TOG for the seed bedtime', () => {
    expect(target).toBe(2);
  });
  it('recommends grey bag + long-sleeve bodysuit + sleepwear (1.8 TOG)', () => {
    expect(list[0].slots).toEqual({ base: 'i6', mid: 'i7', bag: 'i2', socks: null });
    expect(list[0].total).toBeCloseTo(1.8, 10);
    expect(list[0].score).toBeCloseTo(0.2 + 3 * 0.02, 10);
  });
  it('offers two alternatives with distinct totals', () => {
    const alts = distinctTotals(list.slice(1)).slice(0, 2);
    expect(alts).toHaveLength(2);
    expect(Math.abs(alts[0].total - alts[1].total)).toBeGreaterThan(0.05);
    expect(alts.every(a => Math.abs(a.total - list[0].total) >= 0.05 || a === alts[0])).toBe(true);
  });
  it('only uses available items and always a bag plus base or mid', () => {
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(byId(c.slots.bag).cat).toBe('bag');
      expect(c.slots.base || c.slots.mid).toBeTruthy();
      expect(Object.values(c.slots).filter(Boolean).every(id => byId(id).available)).toBe(true);
    }
    expect(list.some(c => c.slots.mid === 'i8')).toBe(false); // fleece is in the wash
  });
  it('enumerates every combination', () => {
    // 4 bags × (3 bases × 4 mids × 2 socks − 2 with neither base nor mid)
    expect(list).toHaveLength(4 * (3 * 4 * 2 - 2));
  });
  it('is sorted by score ascending', () => {
    for (let i = 1; i < list.length; i++) expect(list[i].score).toBeGreaterThanOrEqual(list[i - 1].score);
  });
  it('applies the sleeve, socks and layering penalties', () => {
    const it = (id: string, cat: Item['cat'], tog: number, sleeve: Item['sleeve'] = 'none') => ({ id, cat, tog, sleeve, available: true });
    const bag = it('b', 'bag', 1);
    const short = it('s', 'body', 0.2, 'short');
    const long = it('l', 'body', 0.2, 'long');
    const score = (items: ReturnType<typeof it>[], ov: number) => combos(items, ov, 1.2)[0].score;
    // below 19 with no long sleeve: +0.3
    expect(score([bag, short], 18.9)).toBeCloseTo(0.3 + 0.04, 10);
    expect(score([bag, long], 18.9)).toBeCloseTo(0.04, 10);
    // above 23 with a long sleeve: +0.3
    expect(score([bag, long], 23.1)).toBeCloseTo(0.3 + 0.04, 10);
    // socks at 18 or more: +0.2
    const socks = it('k', 'socks', 0.1);
    const withSocks = combos([bag, long, socks], 18, 1.2).find(c => c.slots.socks)!;
    expect(withSocks.score).toBeCloseTo(0.1 + 0.2 + 0.06, 10);
    const coldSocks = combos([bag, long, socks], 17.9, 1.2).find(c => c.slots.socks)!;
    expect(coldSocks.score).toBeCloseTo(0.1 + 0.06, 10);
    // base + mid above 23: +0.15 (plus +0.3 because the mid is long-sleeved)
    const mid = it('m', 'pjs', 0, 'short');
    const both = combos([bag, short, mid], 23.5, 1.2).find(c => c.slots.base && c.slots.mid)!;
    expect(both.score).toBeCloseTo(0 + 0.15 + 0.06, 10);
  });
  it('returns nothing without an available bag', () => {
    expect(combos(S.items.map(i => (i.cat === 'bag' ? { ...i, available: false } : i)), ov, target)).toEqual([]);
  });
});

describe('ageMonths()', () => {
  const now = new Date('2026-10-08T12:00:00');
  it('counts whole months from the date of birth', () => {
    expect(ageMonths('2024-07-08', now)).toBe(27);
    expect(ageMonths('2024-07-09', now)).toBe(26); // not yet this month's birthday
    expect(ageMonths('2026-10-01', now)).toBe(0);
  });
  it('returns null without a valid date', () => {
    expect(ageMonths('', now)).toBeNull();
    expect(ageMonths('27', now)).toBeNull();
  });
});
