import { SLOTS, baseTog, clampT, combos, dayLabel, f1, overnight, type Combo } from '../../../shared/model.ts';
import type { Derived } from '../derive.ts';
import { fetchWeather, type State } from '../store.ts';
import { Header } from '../components/ui.tsx';

export function Forecast({ s, d }: { s: State; d: Derived }) {
  const dv = s.device;
  const { items, byId, L } = d;
  const namesOfSlots = (c: Combo) => SLOTS.map(sl => byId(c.slots[sl.id])).filter(Boolean).map(i => i!.name);
  const allAvail = items.map(i => ({ ...i, available: true }));

  const rows = s.wx.fcNights.map(fn => {
    const fov = overnight(dv.room, fn.avg, d.thermo, dv.door);
    const ftg = clampT(baseTog(fov) + L.offset);
    const c = combos(items, fov, ftg)[0];
    const ca = combos(allAvail, fov, ftg)[0];
    const wash = ca && (!c || ca.score < c.score - 0.1)
      ? SLOTS.map(sl => ca.slots[sl.id]).filter(id => id && !byId(id)!.available).map(id => byId(id)!.name) : [];
    return {
      key: fn.date, label: dayLabel(fn.date), outside: fn.avg + '° avg · ' + fn.min + '–' + fn.max + '°', room: f1(fov) + '°',
      tog: c ? f1(c.total) : '—', names: c ? namesOfSlots(c) : ['No sleeping bag available'],
      washText: wash.length ? 'Wash the ' + wash.join(' and ') + ' — it suits this night better (' + f1(ca.total) + ' TOG).' : '',
    };
  });

  return (
    <div>
      <Header kicker={`Next 3 nights · ${s.data.settings.city}`} title="Forecast" />
      <div style={{ padding: '10px 20px', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-surface)', fontSize: 12, lineHeight: 1.4 }}>
        Uses the 7pm–7am forecast with tonight’s room ({f1(dv.room)}°), radiator ({d.thermo == null ? 'off' : f1(d.thermo) + '°'}) and door settings.
      </div>
      {!rows.length && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Forecast unavailable</div>
          <div style={{ fontSize: 14 }}>Check the postcode in Settings, then try again.</div>
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={fetchWeather}>Try again</button>
        </div>
      )}
      {rows.map(f => (
        <div key={f.key} style={{ borderBottom: '2px solid var(--color-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '14px 20px 8px' }}>
            <h4 style={{ margin: 0, flex: 1 }}>{f.label}</h4>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{f.outside}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr)', borderTop: '1px solid var(--color-divider)' }}>
            <div style={{ padding: '10px 12px 12px 20px', borderRight: '2px solid var(--color-divider)' }}>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: 'var(--color-accent)' }}>{f.tog}</div>
              <div style={{ fontSize: 11, fontWeight: 800 }}>TOG</div>
              <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 6 }}>Room ≈ {f.room}</div>
            </div>
            <div style={{ padding: '10px 20px 12px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {f.names.map((n, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.3 }}>{n}</div>)}
            </div>
          </div>
          {f.washText && (
            <div style={{ display: 'flex', gap: 10, padding: '10px 20px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: 13, lineHeight: 1.35, borderTop: '1px solid var(--color-divider)' }}>
              <b>Laundry</b><span>{f.washText}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
