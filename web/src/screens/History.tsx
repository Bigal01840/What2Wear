import { HEALTH, SIGNS, SLOTS, SLOT_OF, actualOf, baseTog, dayLabel, f1, overnight, r1, sgn, type Item, type Night } from '../../../shared/model.ts';
import type { Derived } from '../derive.ts';
import { deleteRecord, flash, saveRecord, setUi, type NightDraft, type State } from '../store.ts';
import { ChipList, Header, RatingGrid, Seg, rLabel, rTone } from '../components/ui.tsx';

const X = (t: number) => 36 + (Math.max(14, Math.min(26, t)) - 14) / 12 * 304;
const Y = (v: number) => 172 - (Math.max(0, Math.min(4, v)) / 4) * 160;
const pts: number[] = [];
for (let t = 14; t <= 26; t += 0.5) pts.push(t);

function openNight(n: Night, items: Item[]) {
  const str = (v: unknown) => (v == null ? '' : String(v));
  const sl = { base: '', mid: '', bag: '', socks: '' };
  (n.items || []).forEach(id => { const it = items.find(i => i.id === id); if (it) sl[SLOT_OF[it.cat]] = id; });
  const nd: NightDraft = {
    id: n.id, date: n.date, room: str(n.room), humidity: str(n.humidity), outdoor: str(n.outdoor), thermo: str(n.thermo),
    morningRoom: str(n.morningRoom), morningHum: str(n.morningHum), door: n.door || 'closed', slots: sl,
    rating: n.rating ?? null, health: n.health || [], signs: n.signs || [], note: n.note || '',
  };
  setUi({ nightDraft: nd, ndErr: '' });
}

export function History({ s, d }: { s: State; d: Derived }) {
  const { L, child, sorted } = d;
  const rated = sorted.filter(n => n.rating != null);
  const insight = L.n < 2 ? `Rate a few more mornings and this will show whether ${child} runs warm or cool.`
    : Math.abs(L.offset) < 0.1 ? `${child} sleeps comfortably at the standard guide. No adjustment applied.`
    : `${child} tends to run ${L.offset < 0 ? 'warm' : 'cool'}, so tonight’s target is ${Math.abs(L.offset).toFixed(1)} TOG ${L.offset < 0 ? 'below' : 'above'} the standard chart.`;
  const legend = (sw: React.CSSProperties, l: string) => (
    <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={sw} />{l}</span>
  );

  return (
    <div>
      <Header kicker={`${L.n} nights rated`} title="What it’s learned" />
      <div style={{ padding: '16px 20px', borderBottom: '2px solid var(--color-divider)', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 16, alignItems: 'center' }}>
        <div><div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: 'var(--color-accent)' }}>{sgn(L.offset)}</div><div style={{ fontSize: 12, fontWeight: 800 }}>TOG vs guide</div></div>
        <div style={{ fontSize: 14, lineHeight: 1.4, textWrap: 'pretty' } as any}>{insight}</div>
      </div>
      <div style={{ padding: '14px 20px 8px', borderBottom: '2px solid var(--color-divider)' }}>
        <h6 style={{ margin: '0 0 6px' }}>TOG worn vs overnight room temp</h6>
        <svg width="350" height="196" viewBox="0 0 350 196" style={{ display: 'block', fontFamily: 'var(--font-body)', maxWidth: '100%', height: 'auto' }}>
          {[0, 1, 2, 3, 4].map(v => (
            <g key={v}>
              <line x1="32" x2="346" y1={Y(v)} y2={Y(v)} style={{ stroke: 'var(--color-neutral-300)', strokeWidth: 1 }} />
              <text x="0" y={Y(v) + 3} style={{ fontSize: 10, fill: 'var(--color-neutral-700)' }}>{v}</text>
            </g>
          ))}
          {[14, 16, 18, 20, 22, 24, 26].map(t => <text key={t} x={X(t) - 8} y="190" style={{ fontSize: 10, fill: 'var(--color-neutral-700)' }}>{t}°</text>)}
          <polyline points={pts.map(t => X(t) + ',' + Y(baseTog(t))).join(' ')} style={{ fill: 'none', stroke: 'var(--color-text)', strokeWidth: 1.5 }} />
          <polyline points={pts.map(t => X(t) + ',' + Y(baseTog(t) + L.offset)).join(' ')} style={{ fill: 'none', stroke: 'var(--color-accent)', strokeWidth: 2, strokeDasharray: '5 4' }} />
          {rated.map(n => (
            <rect key={n.id} x={X((n.actual ?? n.overnight) as number) - 5} y={Y(n.tog) - 5} width="10" height="10"
              style={{ fill: n.rating! < 0 ? 'var(--color-bg)' : n.rating === 0 ? 'var(--color-text)' : 'var(--color-accent)', stroke: n.rating! > 0 ? 'var(--color-accent)' : 'var(--color-text)', strokeWidth: 2 }} />
          ))}
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, padding: '6px 0 4px', color: 'var(--color-neutral-800)' }}>
          {legend({ width: 14, height: 2, background: 'var(--color-text)' }, 'Standard guide')}
          {legend({ width: 14, height: 2, background: 'var(--color-accent)' }, `Adjusted for ${child}`)}
          {legend({ width: 9, height: 9, border: '2px solid var(--color-text)' }, 'Cool')}
          {legend({ width: 9, height: 9, background: 'var(--color-text)' }, 'Right')}
          {legend({ width: 9, height: 9, background: 'var(--color-accent)' }, 'Warm')}
        </div>
      </div>
      <table className="table" style={{ fontSize: 13 }}>
        <thead><tr><th style={{ paddingLeft: 20 }}>Night · tap to edit</th><th>Overnight</th><th>TOG</th><th style={{ paddingRight: 20 }}>Result</th></tr></thead>
        <tbody>
          {sorted.map(n => {
            const [bg, fg] = rTone(n.rating);
            const extra = [n.door === 'open' ? 'Door open' : '', ...(n.health || [])].filter(Boolean).join(' · ');
            return (
              <tr key={n.id} onClick={() => openNight(n, d.items)} style={{ cursor: 'pointer' }} title="Edit this night">
                <td style={{ paddingLeft: 20, textDecoration: 'underline', textDecorationColor: 'var(--color-neutral-400)', textUnderlineOffset: 3 }}>{dayLabel(n.date)}</td>
                <td>{f1((n.actual ?? n.overnight) as number)}°</td>
                <td style={{ fontWeight: 800 }}>{f1(n.tog)}</td>
                <td style={{ paddingRight: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span className="tag" style={{ background: bg, color: fg }}>{rLabel(n.rating)}</span>
                    {extra && <span style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>{extra}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ height: 24 }} />
    </div>
  );
}

export function NightEditor({ s, d }: { s: State; d: Derived }) {
  const nd = s.ui.nightDraft!;
  const { items, byId } = d;
  const ndSet = (patch: Partial<NightDraft>) => setUi(u => ({ nightDraft: u.nightDraft ? { ...u.nightDraft, ...patch } : null }));
  const on = (k: 'room' | 'humidity' | 'outdoor' | 'thermo' | 'morningRoom' | 'morningHum' | 'note') =>
    ({ value: nd[k], onChange: (e: { target: { value: string } }) => ndSet({ [k]: e.target.value }) });
  const ndItems = SLOTS.map(sl => nd.slots[sl.id]).filter(Boolean).map(id => byId(id)).filter(Boolean);
  const ndTog = f1(ndItems.reduce((a, i) => a + i!.tog, 0));

  const save = () => {
    const p = (v: string) => (v === '' || v == null ? null : parseFloat(v));
    const room = p(nd.room), outdoor = p(nd.outdoor), thermo = p(nd.thermo), mr = p(nd.morningRoom), hum = p(nd.humidity), mh = p(nd.morningHum);
    if (room == null || isNaN(room) || outdoor == null || isNaN(outdoor) || thermo == null || isNaN(thermo)) return setUi({ ndErr: 'Bedtime room, outside and radiator need numbers.' });
    if (!nd.slots.bag) return setUi({ ndErr: 'Choose the sleeping bag worn.' });
    const ids = SLOTS.map(sl => nd.slots[sl.id]).filter(Boolean);
    const tog = r1(ids.reduce((a, id) => a + (byId(id)?.tog ?? 0), 0));
    const morningRoom = mr == null || isNaN(mr) ? null : r1(mr);
    const orig = s.data.nights.find(n => n.id === nd.id);
    if (!orig) return setUi({ nightDraft: null });
    saveRecord('nights', {
      ...orig, room: r1(room), outdoor, thermo, humidity: hum != null && isNaN(hum) ? null : hum, morningRoom,
      morningHum: mh == null || isNaN(mh) ? null : mh, door: nd.door, items: ids, tog, overnight: overnight(room, outdoor, thermo, nd.door),
      rating: nd.rating, health: nd.health, signs: nd.signs, note: nd.note,
      actual: morningRoom == null ? null : actualOf(r1(room), morningRoom, nd.door),
    });
    setUi({ nightDraft: null });
    flash('Night updated');
  };
  const del = () => {
    if (!window.confirm('Delete this night? It will no longer count towards learning.')) return;
    deleteRecord('nights', nd.id);
    setUi({ nightDraft: null });
    flash('Night deleted');
  };
  const rule = <div style={{ height: 2, background: 'var(--color-divider)' }} />;
  const numField = (id: string, label: string, step: string, k: Parameters<typeof on>[0]) => (
    <div className="field"><label htmlFor={id}>{label}</label><input id={id} className="input" type="number" step={step} inputMode="decimal" style={{ minHeight: 44 }} {...on(k)} /></div>
  );

  return (
    <div style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: 0, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '2px solid var(--color-divider)' }}>
        <button className="btn btn-ghost" style={{ height: 44 }} onClick={() => setUi({ nightDraft: null })}>Cancel</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>{dayLabel(nd.date)}</div>
        <button className="btn btn-primary" style={{ height: 44 }} onClick={save}>Save</button>
      </div>
      <div className="scr overlay-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h6 style={{ margin: 0 }}>Bedtime</h6>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          {numField('nd-room', 'Room temp °C', '0.1', 'room')}
          {numField('nd-hum', 'Humidity %', '1', 'humidity')}
          {numField('nd-out', 'Outside avg °C', '1', 'outdoor')}
          {numField('nd-thermo', 'Radiator °C', '0.5', 'thermo')}
        </div>
        <div className="field"><label>Door</label><Seg name="nddoor" value={nd.door} opts={[['closed', 'Closed'], ['open', 'Open']]} onPick={v => ndSet({ door: v })} minHeight={40} /></div>
        {rule}
        <h6 style={{ margin: 0 }}>Morning</h6>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          {numField('nd-mroom', 'Room temp °C', '0.1', 'morningRoom')}
          {numField('nd-mhum', 'Humidity %', '1', 'morningHum')}
        </div>
        {rule}
        <h6 style={{ margin: 0 }}>Outfit worn · {ndTog} TOG</h6>
        {SLOTS.map(sl => (
          <div key={sl.id} className="field">
            <label htmlFor={'nd-' + sl.id}>{sl.label}</label>
            <select id={'nd-' + sl.id} className="input" style={{ minHeight: 44 }} value={nd.slots[sl.id] || ''} onChange={e => ndSet({ slots: { ...nd.slots, [sl.id]: e.target.value } })}>
              <option value="">{sl.id === 'bag' ? '— Choose a bag —' : 'None'}</option>
              {items.filter(i => SLOT_OF[i.cat] === sl.id).sort((a, b) => a.tog - b.tog).map(i => <option key={i.id} value={i.id}>{i.name + ' · ' + f1(i.tog) + ' TOG'}</option>)}
            </select>
          </div>
        ))}
        {rule}
        <h6 style={{ margin: 0 }}>Result</h6>
        <RatingGrid value={nd.rating} onPick={v => ndSet({ rating: v })} height={72} symSize={18} />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', marginTop: -8 }} onClick={() => ndSet({ rating: null })}>Mark as not rated</button>
        <div className="field"><label>Health that night</label><ChipList opts={HEALTH} selected={nd.health} onChange={health => ndSet({ health })} /></div>
        <div className="field"><label>Signs noticed</label><ChipList opts={SIGNS} selected={nd.signs} onChange={signs => ndSet({ signs })} bold={false} /></div>
        <div className="field"><label htmlFor="nd-note">Note</label><textarea id="nd-note" className="input" style={{ minHeight: 64 }} {...on('note')} /></div>
        {s.ui.ndErr && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>{s.ui.ndErr}</div>}
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', color: 'var(--color-accent-700)' }} onClick={del}>Delete this night</button>
      </div>
    </div>
  );
}
