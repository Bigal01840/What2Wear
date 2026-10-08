// Development seed data, ported from the prototype's seed(). Never shipped to
// production: only `npm run seed` and the unit tests use it.
import { DEFAULT_SETTINGS, isoLocal, overnight, r1, type Item, type Nap, type Night, type Settings } from './model.ts';

type Partial0 = Partial<Item> & Pick<Item, 'id' | 'name' | 'cat' | 'tog'>;

export function seed(now = new Date()) {
  const ts = now.getTime();
  const B = { sleeve: 'none', legs: 'na', fabric: 'Cotton', size: '18–36m', link: '', photoUrl: '', available: true, notes: '', updatedAt: ts } as const;
  const raw: Partial0[] = [
    { id: 'i1', name: 'Stars sleeping bag', cat: 'bag', tog: 0.5, fabric: 'Cotton jersey' },
    { id: 'i2', name: 'Grey stripe sleeping bag', cat: 'bag', tog: 1.0 },
    { id: 'i3', name: 'Merino sleeping bag', cat: 'bag', tog: 2.5, fabric: 'Merino wool' },
    { id: 'i4', name: 'Winter sleeping bag', cat: 'bag', tog: 3.5, fabric: 'Cotton, poly fill' },
    { id: 'i5', name: 'White short-sleeve bodysuit', cat: 'body', tog: 0.2, sleeve: 'short', size: '2–3y' },
    { id: 'i6', name: 'Striped long-sleeve bodysuit', cat: 'body', tog: 0.3, sleeve: 'long', size: '2–3y' },
    { id: 'i7', name: 'Navy footed sleepsuit', cat: 'suit', tog: 0.5, sleeve: 'long', legs: 'footed', size: '2–3y' },
    { id: 'i8', name: 'Fleece sleepsuit', cat: 'suit', tog: 1.0, sleeve: 'long', legs: 'footed', fabric: 'Polyester fleece', size: '2–3y', available: false },
    { id: 'i9', name: 'Dino short pyjamas', cat: 'pjs', tog: 0.3, sleeve: 'short', legs: 'shorts', size: '2–3y' },
    { id: 'i10', name: 'Rainbow long pyjamas', cat: 'pjs', tog: 0.5, sleeve: 'long', legs: 'footless', size: '2–3y' },
    { id: 'i11', name: 'Bed socks', cat: 'socks', tog: 0.1, size: 'Toddler 4–7' },
  ];
  const items: Item[] = raw.map(i => Object.assign({}, B, i) as Item);
  const togOf = (ids: string[]) => r1(ids.reduce((s, id) => s + items.find(i => i.id === id)!.tog, 0));
  const dateAgo = (ago: number) => { const d = new Date(now); d.setDate(d.getDate() - ago); return isoLocal(d); };

  const n = (ago: number, room: number, out: number, thermo: number, ids: string[], rating: number | null): Night => ({
    id: 'n' + ago + '_' + ts, date: dateAgo(ago), room, outdoor: out, thermo,
    overnight: overnight(room, out, thermo), items: ids, tog: togOf(ids), rating, signs: [], note: '', updatedAt: ts,
  });
  const nights = [
    n(6, 21, 12, 18, ['i5', 'i10', 'i2'], 0),
    n(5, 20, 10, 18, ['i6', 'i8', 'i2'], 1),
    n(4, 19.5, 7, 18, ['i6', 'i3'], 2),
    n(3, 20, 8, 18, ['i6', 'i8', 'i2'], 1),
    n(2, 20.5, 11, 18, ['i6', 'i10', 'i2'], 0),
    n(1, 20, 9, 18, ['i6', 'i10', 'i2'], null),
  ];

  const nap = (ago: number, room: number, ids: string[], rating: number | null): Nap => ({
    id: 'z' + ago, date: dateAgo(ago), start: '12:30', end: '14:30', room, overnight: room, door: 'closed',
    outdoor: 13, items: ids, tog: togOf(ids), rating, health: [], updatedAt: ts,
  });
  const naps = [nap(2, 21, ['i5', 'i10', 'i1'], 0), nap(1, 21.5, ['i6', 'i10', 'i2'], 1)];

  const settings: Settings = { ...DEFAULT_SETTINGS, updatedAt: ts };
  return { items, nights, naps, settings, room: 20.5, humidity: 55, outdoor: 9, thermo: 18 };
}
