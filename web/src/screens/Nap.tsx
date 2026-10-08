import { LEARNING_RATE, SLOTS, baseTog, clampT, combos, dayLabel, f1, learnFrom, newId, r1, sgn, type Combo } from '../../../shared/model.ts';
import { distinctTotals, type Derived } from '../derive.ts';
import { flash, saveRecord, setDevice, setUi, type State } from '../store.ts';
import { BigNum, Header, RatingGrid, Seg, Steppers, rLabel, rTone } from '../components/ui.tsx';

export function Nap({ s, d }: { s: State; d: Derived }) {
  const dv = s.device, ui = s.ui, naps = s.data.naps;
  const { items, byId, today, L, hasFever, feverAdj } = d;
  const namesOfSlots = (c: Combo) => SLOTS.map(sl => byId(c.slots[sl.id])).filter(Boolean).map(i => i!.name);

  const hr = s.wx.hourly;
  const napVals = (() => {
    if (!hr) return null;
    const sh = parseInt(dv.napStart, 10), em = String(dv.napEnd).split(':');
    const eh = Math.max(sh + 1, (+em[0]) + ((+em[1]) > 0 ? 1 : 0));
    const v: number[] = [];
    for (let h = sh; h < eh; h++) {
      const i = hr.time.indexOf(today + 'T' + String(h).padStart(2, '0') + ':00');
      if (i >= 0 && hr.temp[i] != null) v.push(hr.temp[i] as number);
    }
    return v.length ? v : null;
  })();
  const napOut = napVals ? Math.round(napVals.reduce((a, b) => a + b, 0) / napVals.length) : null;
  const napEff = r1(dv.napRoom - (dv.napDoor === 'open' ? 0.2 : 0));
  const NL = s.data.settings.learning ? learnFrom(naps, LEARNING_RATE, null) : { offset: 0, n: 0 };
  const napOff = NL.n >= 2 ? NL.offset : L.offset;
  const napTarget = clampT(baseTog(napEff) + napOff + feverAdj);
  const napC = distinctTotals(combos(items, napEff, napTarget)).slice(0, 3);
  const napPick = Math.min(ui.napPick, Math.max(0, napC.length - 1));
  const napSel = napC[napPick];
  const napOpen = [...naps].sort((a, b) => a.id.localeCompare(b.id)).reverse().find(n => n.date === today && n.rating == null);

  const logNap = () => {
    if (!napSel) return;
    const ids = SLOTS.map(sl => napSel.slots[sl.id]).filter((x): x is string => !!x);
    saveRecord('naps', {
      id: newId('z'), date: today, start: dv.napStart, end: dv.napEnd, room: dv.napRoom, overnight: napEff, door: dv.napDoor,
      outdoor: napOut, items: ids, tog: r1(napSel.total), rating: null, health: ui.health, updatedAt: 0,
    });
    setUi({ napRating: null });
    flash('Nap logged. Rate it when they wake.');
  };
  const saveNapRating = () => {
    if (!napOpen || ui.napRating == null) return;
    saveRecord('naps', { ...napOpen, rating: ui.napRating });
    setUi({ napRating: null });
    flash('Nap saved');
  };
  const rows = [...naps].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 6);

  return (
    <div>
      <Header kicker={NL.n + ' naps rated' + (NL.n < 2 ? ' · using night learning' : '')} title="Nap" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, padding: '12px 20px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="field"><label>Start</label><input className="input" type="time" style={{ minHeight: 44 }} value={dv.napStart} onChange={e => setDevice({ napStart: e.target.value || '12:30' })} /></div>
        <div className="field"><label>End</label><input className="input" type="time" style={{ minHeight: 44 }} value={dv.napEnd} onChange={e => setDevice({ napEnd: e.target.value || '14:30' })} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ padding: '12px 12px 12px 20px', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="lbl">Room now</div>
          <BigNum value={dv.napRoom} step={0.1} label="Nap room temperature" unit="°" onCommit={v => setDevice({ napRoom: v })} />
          <Steppers style={{ marginTop: 6 }}
            down={() => setDevice({ napRoom: Math.max(10, Math.min(32, r1(dv.napRoom - 0.1))) })}
            up={() => setDevice({ napRoom: Math.max(10, Math.min(32, r1(dv.napRoom + 0.1))) })} />
        </div>
        <div style={{ padding: '12px 12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="lbl">Outside during nap</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{napOut == null ? '—' : napOut + '°'}</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>{napOut == null ? 'No forecast for this time' : (s.wx.src || 'Forecast') + ' · ' + dv.napStart + '–' + dv.napEnd}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="lbl" style={{ flex: 1 }}>Door</div>
        <Seg name="napdoor" value={dv.napDoor} opts={[['closed', 'Closed'], ['open', 'Open']]} onPick={v => setDevice({ napDoor: v })} />
      </div>
      <div style={{ padding: '10px 20px', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-surface)' }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{f1(napTarget)} TOG target</div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-800)' }}>
          {'Guide for ' + f1(napEff) + '°C is ' + f1(baseTog(napEff)) + ' TOG. ' + (NL.n >= 2 ? 'Nap learning ' + sgn(NL.offset) + ' TOG from ' + NL.n + ' naps.' : 'Using night learning (' + sgn(L.offset) + ' TOG) until 2 naps are rated.') + (hasFever ? ' Fever −0.5.' : '')}
        </div>
      </div>
      <div style={{ padding: '14px 20px 4px' }}><h6 style={{ margin: '0 0 8px' }}>Pick an outfit</h6></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 20px' }}>
        {napC.map((c, i) => {
          const sel = i === napPick;
          return (
            <button key={i} onClick={() => setUi({ napPick: i })} aria-pressed={sel} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr)', gap: 10, alignItems: 'start', padding: 12, border: sel ? '2px solid var(--color-text)' : '2px solid var(--color-neutral-300)', background: sel ? 'var(--color-surface)' : 'var(--color-bg)', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span><span style={{ display: 'block', fontSize: 24, fontWeight: 800, lineHeight: 1, color: sel ? 'var(--color-accent)' : 'var(--color-text)' }}>{f1(c.total)}</span><span style={{ fontSize: 10, fontWeight: 800 }}>TOG</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {i === 0 && <span style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>Best fit</span>}
                <span style={{ fontSize: 13, lineHeight: 1.35 }}>{namesOfSlots(c).join(' + ')}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '14px 20px 20px' }}>
        {!napOpen && napSel && (
          <button className="btn btn-primary" style={{ width: '100%', height: 52, justifyContent: 'flex-start', padding: '0 16px', fontSize: 16 }} onClick={logNap}>Dressed — log this nap</button>
        )}
        {napOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ margin: 0 }}>How was the nap?</h4>
            <RatingGrid value={ui.napRating} onPick={v => setUi({ napRating: v })} height={80} symSize={18} />
            <button className="btn btn-primary" style={{ width: '100%', height: 48, justifyContent: 'flex-start', padding: '0 16px' }} disabled={ui.napRating == null} onClick={saveNapRating}>Save and learn</button>
          </div>
        )}
      </div>
      {naps.length > 0 && (
        <table className="table" style={{ fontSize: 13, borderTop: '2px solid var(--color-divider)' }}>
          <thead><tr><th style={{ paddingLeft: 20 }}>Recent naps</th><th>Room</th><th>TOG</th><th style={{ paddingRight: 20 }}>Result</th></tr></thead>
          <tbody>
            {rows.map(n => {
              const [bg, fg] = rTone(n.rating);
              return (
                <tr key={n.id}>
                  <td style={{ paddingLeft: 20 }}>{dayLabel(n.date).replace(/^\w+ /, '') + ' · ' + n.start}</td>
                  <td>{f1(n.room)}°</td>
                  <td style={{ fontWeight: 800 }}>{f1(n.tog)}</td>
                  <td style={{ paddingRight: 20 }}><span className="tag" style={{ background: bg, color: fg }}>{rLabel(n.rating)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}
