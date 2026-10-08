import { useEffect, useRef, useState } from 'react';
import { isoLocal, type Settings as S } from '../../../shared/model.ts';
import { get, set } from 'idb-keyval';
import { fetchWeather, flash, lookupPostcode, makeBackup, parseBackup, restoreBackup, saveSettings, setUi, type State } from '../store.ts';
import { LOCAL } from '../config.ts';
import { Seg } from '../components/ui.tsx';
import { enablePush, isIosBrowserTab, showLocalNotification, permission, pushSupported, sendTestPush, type Perm } from '../push.ts';

export function SettingsSheet({ s }: { s: State }) {
  const st = s.data.settings;
  const [perm, setPerm] = useState<Perm>(permission());
  useEffect(() => { setPerm(permission()); }, []);
  const close = () => setUi({ sheet: false });
  const onSet = (k: keyof S) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    saveSettings({ [k]: (k === 'lat' || k === 'lon' || k === 'age') && v !== '' && !isNaN(+v) ? +v : v });
  };
  const input = (k: 'child' | 'age' | 'postcode' | 'city' | 'lat' | 'lon') => ({ value: String(st[k] ?? ''), onChange: onSet(k) });

  const notifStatus = !st.remind ? 'Off.'
    : LOCAL ? (perm === 'granted' ? 'Daily at ' + (st.remindAt || '07:00') + '. Shows as a phone notification while the app is open.'
      : perm === 'denied' ? 'Notifications are blocked in this browser, so the reminder only shows inside the app.'
      : perm === 'none' ? 'This browser can’t show system notifications; the reminder shows inside the app.'
      : 'Allow notifications when asked to get it on your lock screen.')
    : perm === 'granted' ? `Daily at ${st.remindAt || '07:00'} while a night is unrated. Arrives on this phone as a notification.`
    : perm === 'denied' ? 'Notifications are blocked for this app, so the reminder only shows inside the app.'
    : perm === 'none' ? (isIosBrowserTab() ? 'Add Sleep Outfit to your Home Screen to get the reminder as a notification.' : 'This browser can’t show system notifications; the reminder shows inside the app.')
    : 'Allow notifications when asked to get it on your lock screen.';

  const pickRemind = (v: boolean) => {
    saveSettings({ remind: v });
    if (LOCAL) {
      if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(() => setPerm(permission())).catch(() => {});
      return;
    }
    if (v && pushSupported() && Notification.permission === 'default') enablePush().finally(() => setPerm(permission())).catch(() => {});
  };
  const testNotif = () => {
    close();
    if (LOCAL) {
      setTimeout(() => { showLocalNotification(st.child || 'Our toddler'); setUi({ notif: true }); }, 400);
      return;
    }
    sendTestPush().then(ok => {
      setPerm(permission());
      // No push on this phone: show the in-app banner, as the prototype did.
      if (!ok) setTimeout(() => setUi({ notif: true }), 400);
    });
  };

  return (
    <div onClick={close} style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: 0, background: 'color-mix(in srgb,var(--color-neutral-900) 50%,transparent)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 6 }}>
      <div onClick={e => e.stopPropagation()} className="scr" style={{ background: 'var(--color-bg)', borderTop: '2px solid var(--color-text)', padding: '16px 20px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}><h3 style={{ margin: 0, flex: 1 }}>Settings</h3><button className="btn btn-ghost" style={{ height: 44 }} onClick={close}>Done</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 8 }}>
          <div className="field"><label htmlFor="st-child">Child’s name</label><input id="st-child" className="input" style={{ minHeight: 44 }} {...input('child')} /></div>
          <div className="field"><label htmlFor="st-dob">Date of birth</label><input id="st-dob" className="input" style={{ minHeight: 44 }} type="date" max={isoLocal(new Date())} value={st.dob || ''} onChange={e => saveSettings({ dob: e.target.value })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 0 }}><label htmlFor="st-pc">Postcode</label><input id="st-pc" className="input" style={{ minHeight: 44, textTransform: 'uppercase' }} placeholder="e.g. SW1A 1AA" autoCapitalize="characters" {...input('postcode')} /></div>
          <button className="btn btn-primary" style={{ height: 44 }} onClick={lookupPostcode}>Look up</button>
        </div>
        {s.ui.pcMsg && <div style={{ fontSize: 12, marginTop: -6, color: s.ui.pcErr ? 'var(--color-accent-700)' : 'var(--color-neutral-700)' }}>{s.ui.pcMsg}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
          <div className="field"><label htmlFor="st-city">Location</label><input id="st-city" className="input" style={{ minHeight: 44 }} {...input('city')} /></div>
          <div className="field"><label htmlFor="st-lat">Lat</label><input id="st-lat" className="input" style={{ minHeight: 44 }} inputMode="decimal" {...input('lat')} /></div>
          <div className="field"><label htmlFor="st-lon">Lon</label><input id="st-lon" className="input" style={{ minHeight: 44 }} inputMode="decimal" {...input('lon')} /></div>
        </div>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', height: 44 }} onClick={fetchWeather}>Refresh 7pm–7am forecast</button>
        {!LOCAL && <div className="field"><label>Morning reminder</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seg name="remind" value={!!st.remind} opts={[[true, 'On'], [false, 'Off']]} onPick={pickRemind} />
            <input className="input" type="time" aria-label="Reminder time" style={{ minHeight: 38, width: 120 }} value={st.remindAt} onChange={e => saveSettings({ remindAt: e.target.value || '07:00' })} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6, textWrap: 'pretty' } as any}>{notifStatus}</div>
          <button className="btn btn-secondary" style={{ marginTop: 8, height: 40 }} onClick={testNotif}>Send a test reminder</button>
        </div>}
        <div className="field"><label>Learn from morning feedback</label>
          <Seg name="learn" value={st.learning} opts={[[true, 'On'], [false, 'Off — use guide only']]} onPick={v => saveSettings({ learning: v })} minHeight={40} />
        </div>
        {LOCAL && <BackupField />}
      </div>
    </div>
  );
}

/** Local mode only: everything lives on this phone, so offer a backup file. */
function BackupField() {
  const [last, setLast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { get('lastExport').then(v => setLast(v ?? null)).catch(() => {}); }, []);

  const exportData = async () => {
    const b = makeBackup();
    const name = `sleep-outfit-backup-${isoLocal(new Date())}.json`;
    const file = new File([JSON.stringify(b)], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Sleep Outfit backup' }); // iPhone: "Save to Files"
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // share sheet cancelled
      flash('Couldn’t save the backup');
      return;
    }
    const when = new Date().toISOString();
    set('lastExport', when).catch(() => {});
    setLast(when);
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const b = parseBackup(await f.text());
      const when = new Date(b.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!window.confirm(`Replace everything on this phone with the backup from ${when}? It has ${plural(b.data.items.length, 'item')} and ${plural(b.data.nights.length, 'night')}.`)) return;
      await restoreBackup(b);
      setUi({ sheet: false });
      flash('Backup restored');
    } catch (err) {
      flash((err as Error).message || 'Couldn’t read that file');
    }
  };

  const lastLabel = last ? new Date(last).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
  return (
    <div className="field"><label>Backup</label>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginBottom: 8, textWrap: 'pretty' } as any}>
        Everything is stored on this phone only. Save a backup file to iCloud Drive or Files now and then.
        {lastLabel ? ` Last saved ${lastLabel}.` : ' No backup saved yet.'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={{ height: 40 }} onClick={exportData}>Export data</button>
        <button className="btn btn-secondary" style={{ height: 40 }} onClick={() => fileRef.current?.click()}>Import data</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={importData} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
