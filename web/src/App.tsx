import { useEffect, useMemo, type ReactNode } from 'react';
import { derive } from './derive.ts';
import { setTab, setUi, store, useStore, type Tab } from './store.ts';
import { I } from './components/ui.tsx';
import { Tonight } from './screens/Tonight.tsx';
import { Forecast } from './screens/Forecast.tsx';
import { Nap } from './screens/Nap.tsx';
import { Morning } from './screens/Morning.tsx';
import { ItemEditor, Wardrobe } from './screens/Wardrobe.tsx';
import { History, NightEditor } from './screens/History.tsx';
import { SettingsSheet } from './screens/Settings.tsx';
import { Login } from './screens/Login.tsx';

const TAB_DEF: [Tab, string, () => ReactNode][] = [
  ['tonight', 'Tonight', I.moon], ['forecast', 'Forecast', I.calendar], ['nap', 'Nap', I.cloud],
  ['morning', 'Morning', () => I.sun()], ['wardrobe', 'Wardrobe', I.shirt], ['history', 'History', I.chart],
];

/** While the app is open, show the in-app banner at the reminder time (push covers it when closed). */
function useLocalReminder(remind: boolean, remindAt: string) {
  useEffect(() => {
    if (!remind) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const p = String(remindAt || '07:00').split(':');
      const now = new Date(), at = new Date(now);
      at.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
      if (at <= now) at.setDate(at.getDate() + 1);
      t = setTimeout(() => { if (derive(store.get()).pending) setUi({ notif: true }); schedule(); }, at.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(t);
  }, [remind, remindAt]);
}

export function App() {
  const s = useStore();
  const d = useMemo(() => derive(s), [s.data, s.device, s.ui.health, s.ui.overrides]);
  const ui = s.ui;
  useLocalReminder(s.data.settings.remind, s.data.settings.remindAt);

  if (s.auth === 'out' || (s.auth === 'unknown' && s.loaded)) {
    return <div className="app"><div className="frame"><div className="statusbar" /><div className="scr scr-main" style={{ bottom: 0 }}><Login /></div></div></div>;
  }
  if (!s.loaded) return <div className="app" />;

  return (
    <div className="app">
      <div className="frame">
        <div className="statusbar">
          <span style={{ flex: 1 }} /><span style={{ fontSize: 12 }}>{s.data.settings.city}</span>
        </div>

        <div className="scr scr-main">
          {ui.tab === 'tonight' && <Tonight s={s} d={d} />}
          {ui.tab === 'forecast' && <Forecast s={s} d={d} />}
          {ui.tab === 'nap' && <Nap s={s} d={d} />}
          {ui.tab === 'morning' && <Morning s={s} d={d} />}
          {ui.tab === 'wardrobe' && <Wardrobe s={s} />}
          {ui.tab === 'history' && <History s={s} d={d} />}
        </div>

        <nav className="tabbar">
          {TAB_DEF.map(([id, l, icon]) => {
            const a = ui.tab === id;
            const dot = id === 'morning' && !!d.fbTarget && !a;
            return (
              <button key={id} onClick={() => setTab(id, { learnMsg: id === 'morning' ? ui.learnMsg : '' })} aria-current={a ? 'page' : undefined}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '0 6px 0 8px', border: 0, background: 'transparent', font: 'inherit', fontSize: 11, fontWeight: 600, color: a ? 'var(--color-accent)' : 'var(--color-text)', cursor: 'pointer', minWidth: 0, height: 72 }}>
                <span style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 3, background: a ? 'var(--color-accent)' : 'transparent' }} />
                <span style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                  {icon()}
                  {dot && <span style={{ width: 8, height: 8, background: 'var(--color-accent)' }} />}
                </span>
                {l}
              </button>
            );
          })}
        </nav>

        {ui.toast && (
          <div role="status" style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', padding: '12px 14px', background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: 14, fontWeight: 600, boxShadow: 'var(--shadow-md)', zIndex: 9 }}>{ui.toast}</div>
        )}

        {ui.notif && (
          <div onClick={() => setTab('morning', { notif: false })} style={{ position: 'absolute', top: 52, left: 8, right: 8, zIndex: 8, display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 12px 12px 14px', background: 'var(--color-text)', color: 'var(--color-bg)', boxShadow: 'var(--shadow-lg)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.75 }}>Sleep Outfit · {s.data.settings.remindAt}</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>How did {d.child} sleep?</div>
              <div style={{ fontSize: 13 }}>Tap to rate last night and add the morning room reading.</div>
            </div>
            <button onClick={e => { e.stopPropagation(); setUi({ notif: false }); }} aria-label="Dismiss" style={{ width: 36, height: 36, flex: 'none', border: '1px solid color-mix(in srgb,var(--color-bg) 40%,transparent)', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 9 }}>{I.x()}</button>
          </div>
        )}

        {ui.draft && <ItemEditor s={s} />}
        {ui.nightDraft && <NightEditor s={s} d={d} />}
        {ui.sheet && <SettingsSheet s={s} />}
      </div>
    </div>
  );
}
