// Values computed from state, ported from the prototype's renderVals().
import {
  DAYTEMP_COEF, DRIFT, FEVER, LEARNING_RATE, SUN_COEF, WIND_COEF, ageMonths, learnAt, learnBedtime, learnDrift, SLOTS, SLOT_OF, baseTog, clampT, combos, dayLabel, distinctTotals, humAdjOf, isoLocal,
  learnFrom, overnight, type Item, type Night,
} from '../../shared/model.ts';
import type { State } from './store.ts';

export function derive(s: State) {
  const { items, nights, settings } = s.data;
  const d = s.device;
  const byId = (id: string | null | undefined) => (id ? items.find(i => i.id === id) : undefined);
  const child = settings.child || 'Our toddler';
  const today = isoLocal(new Date());
  const learn = (list: Parameters<typeof learnFrom>[0], door: string | null) =>
    settings.learning ? learnFrom(list, LEARNING_RATE, door) : { offset: 0, n: 0, doorN: 0 };

  // How this nursery cools, learned from morning readings (the standard rule when learning is off).
  const K = settings.learning ? learnDrift(nights) : { drift: DRIFT, windCoef: WIND_COEF, n: 0, nWind: 0 };
  // How much daytime sun and warmth lift the bedtime room (for forecast nights).
  const B = settings.learning ? learnBedtime(nights) : { sunCoef: SUN_COEF, tempCoef: DAYTEMP_COEF, n: 0 };
  /** Cooling model for a night with this average wind. */
  const cooling = (wind: number | null | undefined) => ({ drift: K.drift, windCoef: K.windCoef, wind: wind ?? null });
  const thermo = d.radiator === false ? null : d.thermo; // null: radiator off
  // Tonight's wind only applies while the outside figure is the live forecast.
  const wind = s.wx.outdoorAuto ? s.wx.wind : null;
  const ov = overnight(d.room, d.outdoor, thermo, d.door, cooling(wind));
  const guide = baseTog(ov);
  const L = learn(nights, d.door); // overall warm/cool offset (History, Morning messages)
  /** Offset for a night at temperature t, from nearby rated nights. */
  const offsetAt = (t: number) =>
    settings.learning ? learnAt(nights, LEARNING_RATE, d.door, t) : { offset: 0, n: 0, doorN: 0, near: 0 };
  const LT = offsetAt(ov); // tonight's offset
  const humAdj = humAdjOf(d.humidity);
  const hasFever = s.ui.health.includes(FEVER);
  const feverAdj = hasFever ? -0.5 : 0;
  const target = clampT(guide + LT.offset + humAdj + feverAdj);

  const all = combos(items, ov, target);
  const best = all[0];
  const cur = best ? { ...best.slots, ...s.ui.overrides } : null;
  const curItems = cur ? SLOTS.map(sl => byId(cur[sl.id])).filter((x): x is Item => !!x) : [];
  const total = curItems.reduce((a, i) => a + i.tog, 0);

  const sorted = [...nights].sort((a, b) => b.date.localeCompare(a.date));
  const pending = sorted.find(n => n.rating == null && n.date < today);
  const fbTarget = sorted.find(n => n.rating == null);
  const tonightN = nights.find(n => n.date === today);
  const namesOf = (n: Night) => n.items.map(id => byId(id)?.name ?? '(deleted item)').join(' + ');

  return {
    items, byId, child, today, thermo, K, B, cooling, wind, ov, guide, L, LT, offsetAt, learn, humAdj, hasFever, feverAdj, target,
    all, best, cur, curItems, total, sorted, pending, fbTarget, tonightN, namesOf,
  };
}

export type Derived = ReturnType<typeof derive>;

export const sleeveTxt: Record<string, string> = { short: 'Short sleeve', long: 'Long sleeve', none: '' };

/** Age from date of birth (falls back to the old months field). */
export function ageLabel(settings: { dob?: string; age: number | string }) {
  const a = ageMonths(settings.dob || '') ?? (+settings.age || 0);
  return a < 24 ? a + 'm' : Math.floor(a / 12) + 'y ' + (a % 12) + 'm';
}

export function pendingLabel(date: string) {
  return date === isoLocal(new Date(Date.now() - 864e5)) ? 'last night' : dayLabel(date);
}

/** Candidates for the Swap button: [None (not for bag), …available items by TOG]. */
export function swapCands(items: Item[], slot: string): (string | null)[] {
  return ([] as (string | null)[]).concat(slot === 'bag' ? [] : [null],
    items.filter(i => i.available && SLOT_OF[i.cat] === slot).sort((a, b) => a.tog - b.tog).map(i => i.id));
}

export { distinctTotals };
