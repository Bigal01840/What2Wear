import { HEALTH, SIGNS, actualOf, dayLabel, f1, r1, sgn } from '../../../shared/model.ts';
import type { Derived } from '../derive.ts';
import { saveRecord, setTab, setUi, type Fb, type State } from '../store.ts';
import { BigNum, ChipList, Header, I, RatingGrid, Steppers } from '../components/ui.tsx';

export function Morning({ s, d }: { s: State; d: Derived }) {
  const dv = s.device, fb = s.ui.fb;
  const { fbTarget, L, child, namesOf } = d;
  const fbHealth = fb.health ?? fbTarget?.health ?? [];
  const setFb = (patch: Partial<Fb> | ((f: Fb) => Partial<Fb>)) =>
    setUi(u => ({ fb: { ...u.fb, ...(typeof patch === 'function' ? patch(u.fb) : patch) } }));
  const fbStep = (k: 'mRoom' | 'mHum', delta: number, dflt: number) => () => setFb(f => ({ [k]: r1((f[k] ?? dflt) + delta) }));

  const saveFb = () => {
    if (!fbTarget || fb.rating == null) return;
    const before = L.offset;
    const mRoom = fb.mRoom ?? dv.room, mHum = fb.mHum ?? dv.humidity;
    const updated = {
      ...fbTarget, rating: fb.rating, signs: fb.signs, note: fb.note, morningRoom: mRoom, morningHum: mHum,
      health: fbHealth, actual: actualOf(fbTarget.room, mRoom, fbTarget.door),
    };
    const nights = s.data.nights.map(n => (n.id === fbTarget.id ? updated : n));
    const after = d.learn(nights, dv.door).offset;
    const dir = after < before ? 'cooler' : after > before ? 'warmer' : 'unchanged';
    saveRecord('nights', updated);
    setUi({
      fb: { rating: null, signs: [], note: '' }, notif: false,
      learnMsg: `Saved ${dayLabel(fbTarget.date)}. Future picks are now ${dir === 'unchanged' ? 'unchanged' : 'a little ' + dir} — ${sgn(after)} TOG vs the guide (was ${sgn(before)}).`,
    });
  };

  return (
    <div>
      <Header kicker={fbTarget ? dayLabel(fbTarget.date) : 'Up to date'} title="Morning check" />
      {s.ui.learnMsg && (
        <div style={{ padding: '12px 20px', background: 'var(--color-surface)', borderBottom: '2px solid var(--color-divider)', fontSize: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {I.check({ flex: 'none', marginTop: 2, color: 'var(--color-accent)' })}<span>{s.ui.learnMsg}</span>
        </div>
      )}
      {fbTarget ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderBottom: '2px solid var(--color-divider)' }}>
            <div style={{ padding: '10px 12px 10px 20px', borderRight: '2px solid var(--color-divider)' }}><div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Room overnight</div><div style={{ fontSize: 20, fontWeight: 800 }}>{f1(fbTarget.overnight)}°</div></div>
            <div style={{ padding: '10px 12px', borderRight: '2px solid var(--color-divider)' }}><div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Outside avg</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fbTarget.outdoor}°</div></div>
            <div style={{ padding: '10px 12px' }}><div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Wore</div><div style={{ fontSize: 20, fontWeight: 800 }}>{f1(fbTarget.tog)} TOG</div></div>
          </div>
          <div style={{ padding: '10px 20px', borderBottom: '2px solid var(--color-divider)', fontSize: 13 }}>{namesOf(fbTarget)}</div>
          <div style={{ padding: '14px 20px 0' }}><div className="lbl" style={{ marginBottom: 6 }}>Nursery this morning</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderTop: '2px solid var(--color-divider)', borderBottom: '2px solid var(--color-divider)' }}>
            <div style={{ padding: '10px 12px 12px 20px', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Room temp</div>
              <BigNum value={fb.mRoom ?? dv.room} step={0.1} label="Morning room temperature" unit="°" onCommit={v => setFb({ mRoom: v })} />
              <Steppers down={fbStep('mRoom', -0.1, dv.room)} up={fbStep('mRoom', 0.1, dv.room)} />
            </div>
            <div style={{ padding: '10px 12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>Humidity</div>
              <BigNum value={fb.mHum ?? dv.humidity} step={0.5} label="Morning humidity" unit="%" onCommit={v => setFb({ mHum: v })} />
              <Steppers down={fbStep('mHum', -5, dv.humidity)} up={fbStep('mHum', 5, dv.humidity)} />
            </div>
          </div>

          <div style={{ padding: '18px 20px 8px' }}>
            <h4 style={{ margin: '0 0 12px' }}>How did {child} sleep?</h4>
            <RatingGrid value={fb.rating} onPick={v => { setFb({ rating: v }); setUi({ learnMsg: '' }); }} height={92} symSize={20} />
            <div style={{ display: 'flex', fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 4 }}><span style={{ flex: 1 }}>Colder</span><span>Warmer</span></div>
          </div>

          <div style={{ padding: '12px 20px 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginBottom: 8 }}>Anything you noticed? (optional)</div>
            <ChipList opts={SIGNS} selected={fb.signs} onChange={signs => setFb({ signs })} bold={false} />
          </div>
          <div style={{ padding: '14px 20px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginBottom: 8 }}>Health that night (flagged nights count less towards learning)</div>
            <ChipList opts={HEALTH} selected={fbHealth} onChange={health => setFb({ health })} />
          </div>
          <div className="field" style={{ padding: '14px 20px 0' }}>
            <label htmlFor="fb-note">Note</label>
            <textarea id="fb-note" className="input" style={{ minHeight: 64 }} placeholder="e.g. Woke at 3am, back of neck damp" value={fb.note} onChange={e => setFb({ note: e.target.value })} />
          </div>
          <div style={{ padding: '16px 20px 24px' }}>
            <button className="btn btn-primary" style={{ width: '100%', height: 52, justifyContent: 'flex-start', padding: '0 16px', fontSize: 16 }} disabled={fb.rating == null} onClick={saveFb}>Save and learn</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>All nights rated</div>
          <div style={{ fontSize: 14 }}>Log tonight’s outfit at bedtime, then come back here in the morning.</div>
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setTab('tonight')}>Go to Tonight</button>
        </div>
      )}
    </div>
  );
}
