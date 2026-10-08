import { HEALTH, SLOTS, f1, newId, r1, sgn, SHOW_ALTERNATIVES, type Night } from '../../../shared/model.ts';
import { ageLabel, distinctTotals, pendingLabel, sleeveTxt, swapCands, type Derived } from '../derive.ts';
import { flash, saveRecord, setDevice, setTab, setUi, setWx, type State } from '../store.ts';
import { BigNum, ChipList, Header, I, Seg, Steppers, bgImg } from '../components/ui.tsx';
import { newItemDraft } from './Wardrobe.tsx';

const cell = (left: boolean, bottom: boolean) => ({
  padding: left ? '12px 12px 12px 20px' : '12px 12px 12px 16px',
  ...(left ? { borderRight: '2px solid var(--color-divider)' } : {}),
  ...(bottom ? { borderBottom: '2px solid var(--color-divider)' } : {}),
  display: 'flex', flexDirection: 'column' as const, gap: 2,
});
const sub = { fontSize: 11, color: 'var(--color-neutral-700)', height: 16 };

export function Tonight({ s, d }: { s: State; d: Derived }) {
  const dv = s.device, wx = s.wx, ui = s.ui;
  const { child, ov, guide, L, humAdj, hasFever, target, best, cur, curItems, total, byId, tonightN, pending, all } = d;
  const diff = r1(total - target);
  const step = (k: 'room' | 'outdoor' | 'thermo' | 'humidity', delta: number, lo: number, hi: number) => () => {
    setDevice({ [k]: Math.max(lo, Math.min(hi, r1(dv[k] + delta))) });
    if (k === 'outdoor') setWx({ outdoorAuto: false });
  };

  const longNow = curItems.some(i => i.sleeve === 'long');
  const reasons = [
    `Room should settle around ${f1(ov)}°C overnight (${f1(dv.room)}° now, ${dv.outdoor}° average outside 7pm–7am${wx.outdoorAuto && wx.outdoorRange ? ` (${wx.outdoorRange.min}–${wx.outdoorRange.max}°)` : ''}, radiator at ${f1(dv.thermo)}°).`,
    `The standard guide for ${f1(ov)}°C is ${f1(guide)} TOG in total.`,
    L.n < 2 ? 'Not enough morning feedback yet to adjust the guide.'
      : Math.abs(L.offset) < 0.1 ? `${L.n} rated nights match the guide, so no adjustment.`
      : `${child} has run ${L.offset < 0 ? 'warm' : 'cool'} across ${L.n} rated nights, so ${sgn(L.offset)} TOG.`,
    ov < 19 ? `Below 19°C: long sleeves${longNow ? ' included' : ' recommended'}.` : ov > 23 ? 'Above 23°C: short sleeves, fewer layers.' : 'Between 19 and 23°C sleeve length is chosen by TOG fit.',
  ];
  if (dv.door === 'open') reasons.splice(1, 0, 'Door open: the room is expected to run about 0.3° cooler' + (L.doorN ? ', and learning uses only the ' + L.doorN + ' rated door-open nights.' : '.'));
  if (hasFever) reasons.push('Fever marked: target lowered by 0.5 TOG.');
  else if (ui.health.length) reasons.push('Marked ' + ui.health.join(' and ').toLowerCase() + ': tomorrow’s rating will count less towards learning.');
  if (humAdj) reasons.splice(3, 0, `Humidity is ${dv.humidity}%, which feels warmer: ${sgn(humAdj)} TOG.`);

  const alts = distinctTotals(all.slice(1)).slice(0, 2);
  const curIds = curItems.map(i => i.id);

  const logTonight = () => {
    if (!cur) return;
    const rec: Night = {
      id: tonightN?.id ?? newId('n'), date: d.today, room: dv.room, outdoor: dv.outdoor, thermo: dv.thermo, overnight: ov,
      items: curIds, tog: r1(total), target, rating: null, signs: [], note: '',
      outdoorRange: wx.outdoorAuto ? wx.outdoorRange : null, door: dv.door, health: ui.health, humidity: dv.humidity, updatedAt: 0,
    };
    saveRecord('nights', rec);
    flash('Logged. Sleep well.');
  };

  const outdoorSrc = wx.status === 'loading' ? 'Fetching…'
    : wx.outdoorAuto && wx.outdoorRange ? `${wx.src || ''} · ${wx.outdoorRange.min}–${wx.outdoorRange.max}°`
    : wx.outdoorAuto ? 'Live forecast' : wx.status === 'fail' ? 'Manual · offline' : 'Manual';
  const empty = d.items.length === 0;

  return (
    <div>
      <Header
        kicker={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title="Tonight"
        right={<button className="btn btn-secondary btn-icon" onClick={() => setUi({ sheet: true })} aria-label="Settings">{I.sliders()}</button>}
      />

      {pending && (
        <button onClick={() => setTab('morning', { learnMsg: '' })} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--color-accent)', color: 'var(--color-bg)', border: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer', borderBottom: '2px solid var(--color-divider)' }}>
          {I.sun(22, { flex: 'none' })}
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15 }}>How was {pendingLabel(pending.date)}?</div><div style={{ fontSize: 12 }}>Rate it so tonight’s pick can learn from it</div></div>
          {I.chevron()}
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderBottom: '2px solid var(--color-divider)' }}>
        <div style={cell(true, true)}>
          <div className="lbl">Room now</div>
          <BigNum value={dv.room} step={0.1} label="Room temperature" unit="°" onCommit={v => setDevice({ room: r1(v) })} />
          <div style={sub}>Nursery</div>
          <Steppers style={{ marginTop: 6 }} down={step('room', -0.1, 10, 32)} up={step('room', 0.1, 10, 32)} />
        </div>
        <div style={cell(false, true)}>
          <div className="lbl">Outside 7pm–7am</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{dv.outdoor}°</div>
          <div style={{ ...sub, color: wx.outdoorAuto ? 'var(--color-accent-700)' : 'var(--color-neutral-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{outdoorSrc}</div>
          <Steppers style={{ marginTop: 6 }} down={step('outdoor', -1, -25, 40)} up={step('outdoor', 1, -25, 40)} />
        </div>
        <div style={cell(true, false)}>
          <div className="lbl">Radiator</div>
          <BigNum value={dv.thermo} step={0.5} label="Radiator setpoint" unit="°" onCommit={v => setDevice({ thermo: v })} />
          <div style={sub}>Thermostat</div>
          <Steppers style={{ marginTop: 6 }} down={step('thermo', -0.5, 5, 30)} up={step('thermo', 0.5, 5, 30)} />
        </div>
        <div style={cell(false, false)}>
          <div className="lbl">Humidity</div>
          <BigNum value={dv.humidity} step={0.5} label="Humidity" unit="%" onCommit={v => setDevice({ humidity: v })} />
          <div style={sub}>Nursery</div>
          <Steppers style={{ marginTop: 6 }} down={step('humidity', -5, 20, 95)} up={step('humidity', 5, 20, 95)} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="lbl" style={{ flex: 1 }}>Nursery door</div>
        <Seg name="door" value={dv.door} opts={[['closed', 'Closed'], ['open', 'Open']]} onPick={v => setDevice({ door: v })} />
      </div>
      <div style={{ padding: '10px 20px 12px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="lbl" style={{ marginBottom: 8 }}>Tonight {child} is</div>
        <ChipList opts={HEALTH} selected={ui.health} onChange={health => setUi({ health })} />
      </div>
      {hasFever && (
        <div style={{ padding: '12px 20px', background: 'var(--color-accent)', color: 'var(--color-bg)', borderBottom: '2px solid var(--color-divider)', fontSize: 13, lineHeight: 1.4 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Fever: dress lighter</div>
          Target lowered by 0.5 TOG. Don’t add layers to “sweat it out”. If you’re worried, call NHS 111 or your GP.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderBottom: '2px solid var(--color-divider)', background: 'var(--color-surface)' }}>
        <div style={{ padding: '10px 12px 10px 20px', borderRight: '2px solid var(--color-divider)' }}>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Expected overnight</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{f1(ov)}°C in the room</div>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Target warmth</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{f1(target)} TOG total</div>
        </div>
      </div>

      {!best && (empty ? (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Add your first sleeping bag</div>
          <div style={{ fontSize: 14 }}>Start with the bag {child} sleeps in, then add the layers that go under it.</div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => { setTab('wardrobe'); setUi({ draft: newItemDraft('bag'), draftErr: '' }); }}>Add sleeping bag</button>
        </div>
      ) : (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>No sleeping bag available</div>
          <div style={{ fontSize: 14 }}>Add one to the wardrobe or mark one as out of the wash.</div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setTab('wardrobe')}>Open wardrobe</button>
        </div>
      ))}

      {best && cur && (
        <>
          <div style={{ padding: '18px 20px 4px' }}>
            <div className="kicker">Dress {child} ({ageLabel(s.data.settings.age)}) in</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '2px 0 10px' }}>
              <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 0.95, letterSpacing: '-.03em', color: 'var(--color-accent)' }}>{f1(total)}</div>
              <div style={{ fontSize: 15, fontWeight: 800, paddingBottom: 6, flex: 1 }}>TOG</div>
              <span className="tag" style={{ marginBottom: 8, background: Math.abs(diff) <= 0.25 ? 'var(--color-neutral-200)' : 'var(--color-accent-100)', color: Math.abs(diff) <= 0.25 ? 'var(--color-neutral-800)' : 'var(--color-accent-800)' }}>
                {Math.abs(diff) <= 0.25 ? 'On target' : `${f1(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'}`}
              </span>
            </div>
            <div style={{ borderBottom: '2px solid var(--color-divider)' }}>
              {SLOTS.map(sl => {
                const it = byId(cur[sl.id]);
                const swap = () => {
                  const c = swapCands(d.items, sl.id);
                  const idx = c.indexOf(cur[sl.id] ?? null);
                  const next = c[(idx + 1) % c.length];
                  setUi(u => ({ overrides: { ...u.overrides, [sl.id]: next } }));
                };
                return (
                  <div key={sl.id} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)' }}>
                    <div style={{ width: 52, height: 52, background: 'var(--color-surface)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 6 }}>
                      {it?.photoUrl
                        ? <div className="grayscale" role="img" aria-label="Item photo" style={{ width: 52, height: 52, flex: 'none', marginLeft: -6, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: bgImg(it.photoUrl) }} />
                        : <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-neutral-600)' }}>{it ? f1(it.tog) : '—'}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>{sl.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25, color: it ? 'var(--color-text)' : 'var(--color-neutral-600)' }}>{it ? it.name : 'None'}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{it ? [f1(it.tog) + ' TOG', sleeveTxt[it.sleeve]].filter(Boolean).join(' · ') : 'Skip this layer'}</div>
                    </div>
                    <button className="btn btn-secondary" style={{ height: 44, gap: 6, justifyContent: 'flex-start' }} onClick={swap}>{I.swap()}Swap</button>
                  </div>
                );
              })}
            </div>
            {Object.keys(ui.overrides).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 12, color: 'var(--color-neutral-700)' }}>
                <span style={{ flex: 1 }}>You’ve swapped layers manually.</span>
                <button className="btn btn-ghost" onClick={() => setUi({ overrides: {} })}>Back to recommended</button>
              </div>
            )}
          </div>

          <div style={{ padding: '12px 20px 20px' }}>
            {!tonightN ? (
              <button className="btn btn-primary" style={{ width: '100%', height: 52, justifyContent: 'flex-start', padding: '0 16px', fontSize: 16, gap: 10 }} onClick={logTonight}>{I.check()}Dressed — log tonight</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 15 }}>{I.check({ color: 'var(--color-accent)' })}Logged · {f1(tonightN.tog)} TOG</div>
                <div style={{ fontSize: 13 }}>Rate it in the morning, with the nursery reading.</div>
                {tonightN.items.join() !== curIds.join() && <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={logTonight}>Update log with this outfit</button>}
              </div>
            )}
          </div>

          <div style={{ padding: '16px 20px', borderTop: '2px solid var(--color-divider)' }}>
            <h6 style={{ margin: '0 0 10px' }}>Why this outfit</h6>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {reasons.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr)', gap: 8, padding: '8px 0', borderTop: '1px solid var(--color-divider)', fontSize: 14, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 800, color: 'var(--color-accent-700)' }}>{i + 1}</span><span style={{ textWrap: 'pretty' } as any}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {SHOW_ALTERNATIVES && alts.length > 0 && (
            <div style={{ padding: '16px 20px 24px', borderTop: '2px solid var(--color-divider)' }}>
              <h6 style={{ margin: '0 0 10px' }}>Also close</h6>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--color-divider)' }}>
                {alts.map((c, i) => (
                  <button key={i} className="row-btn" onClick={() => setUi({ overrides: { ...c.slots } })} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: 12, background: 'var(--color-bg)', border: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{f1(c.total)}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.35 }}>{SLOTS.map(sl => byId(c.slots[sl.id])?.name).filter(Boolean).join(' + ')}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent-700)' }}>Use</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
