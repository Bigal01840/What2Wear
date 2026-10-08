import { useState } from 'react';
import { login } from '../store.ts';

/** Household passcode, entered once per phone. Styled to match the other screen headers. */
export function Login() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    const msg = await login(code);
    setBusy(false);
    if (msg) setErr(msg);
  };
  return (
    <form onSubmit={submit}>
      <div style={{ padding: '16px 20px 14px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker">Sleep Outfit</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 34 }}>Sign in</h1>
      </div>
      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field">
          <label htmlFor="passcode">Household passcode</label>
          <input id="passcode" className="input" style={{ minHeight: 44 }} type="password" autoComplete="current-password" autoFocus value={code} onChange={e => { setCode(e.target.value); setErr(''); }} />
        </div>
        {err && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>{err}</div>}
        <button className="btn btn-primary" type="submit" disabled={!code || busy} style={{ width: '100%', height: 52, justifyContent: 'flex-start', padding: '0 16px', fontSize: 16 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>You only need to do this once on each phone.</div>
      </div>
    </form>
  );
}
