import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RATINGS } from '../../../shared/model.ts';

// ── Icons (Lucide paths, as in the prototype) ───────────────────────
const svg = (size: number, sw: number, children: ReactNode, style?: CSSProperties) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: sw, ...style }}>{children}</svg>
);
export const I = {
  sliders: () => svg(18, 2, <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />),
  sun: (size = 22, style?: CSSProperties) => svg(size, 2, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>, style),
  chevron: () => svg(18, 2.5, <path d="m9 18 6-6-6-6" />),
  minus: () => svg(16, 2.5, <path d="M5 12h14" />),
  plus: (size = 16) => svg(size, 2.5, <path d="M5 12h14M12 5v14" />),
  swap: () => svg(14, 2.5, <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />),
  check: (style?: CSSProperties) => svg(18, 2.5, <path d="M20 6 9 17l-5-5" />, style),
  moon: () => svg(20, 2, <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  calendar: () => svg(20, 2, <path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />),
  cloud: () => svg(20, 2, <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />),
  shirt: () => svg(22, 2, <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />),
  chart: () => svg(22, 2, <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>),
  camera: () => svg(22, 2, <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>),
  external: () => svg(13, 2.5, <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />),
  x: () => svg(16, 2.5, <path d="M18 6 6 18M6 6l12 12" />),
};

// ── Screen header ───────────────────────────────────────────────────
export function Header({ kicker, title, right }: { kicker: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div style={{ padding: '16px 20px 14px', borderBottom: '2px solid var(--color-divider)', ...(right ? { display: 'flex', alignItems: 'flex-end', gap: 12 } : {}) }}>
      <div style={right ? { flex: 1, minWidth: 0 } : undefined}>
        <div className="kicker">{kicker}</div>
        <h1 style={{ margin: '2px 0 0', fontSize: 34 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

// ── Big number input (30px/800 with a 2px underline) ────────────────
export function BigNum({ value, onCommit, step, label, unit }: {
  value: number; onCommit: (v: number) => void; step: number; label: string; unit: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline' }}>
      <input
        className="num-big" type="number" step={step} inputMode="decimal" aria-label={label} value={text}
        onFocus={e => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; setText(String(value)); }}
        onChange={e => { setText(e.target.value); const v = parseFloat(e.target.value); if (!isNaN(v)) onCommit(v); }}
      />
      <span style={{ fontSize: 22, fontWeight: 800 }}>{unit}</span>
    </div>
  );
}

export function Steppers({ down, up, style, disabled }: { down: () => void; up: () => void; style?: CSSProperties; disabled?: boolean }) {
  const b: CSSProperties = { width: 44, height: 36, padding: 0 };
  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      <button className="btn btn-secondary" style={b} onClick={down} disabled={disabled} aria-label="Lower">{I.minus()}</button>
      <button className="btn btn-secondary" style={b} onClick={up} disabled={disabled} aria-label="Raise">{I.plus()}</button>
    </div>
  );
}

// ── Segmented control ───────────────────────────────────────────────
export function Seg<T>({ name, value, opts, onPick, minHeight = 36 }: {
  name: string; value: T; opts: [NoInfer<T>, string][]; onPick: (v: T) => void; minHeight?: number;
}) {
  return (
    <div className="seg">
      {opts.map(([v, l]) => (
        <label key={String(v)} className="seg-opt" style={{ minHeight }}>
          <input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />{l}
        </label>
      ))}
    </div>
  );
}

// ── Chips ───────────────────────────────────────────────────────────
export function Chip({ label, active, onClick, bold = true }: { label: string; active: boolean; onClick: () => void; bold?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      minHeight: 36, padding: '6px 12px', border: `1px solid ${active ? 'var(--color-text)' : 'var(--color-divider)'}`,
      background: active ? 'var(--color-text)' : 'transparent', color: active ? 'var(--color-bg)' : 'var(--color-text)',
      font: 'inherit', fontSize: 13, fontWeight: bold ? 600 : undefined, cursor: 'pointer',
    }}>{label}</button>
  );
}

export function ChipList({ opts, selected, onChange, bold }: { opts: string[]; selected: string[]; onChange: (v: string[]) => void; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {opts.map(l => {
        const a = selected.includes(l);
        return <Chip key={l} label={l} active={a} bold={bold} onClick={() => onChange(a ? selected.filter(x => x !== l) : selected.concat(l))} />;
      })}
    </div>
  );
}

// ── 5-cell rating grid ──────────────────────────────────────────────
export function RatingGrid({ value, onPick, height, symSize }: { value: number | null; onPick: (v: number) => void; height: number; symSize: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', border: '2px solid var(--color-divider)' }}>
      {RATINGS.map((r, i) => {
        const a = value === r.v;
        return (
          <button key={r.v} onClick={() => onPick(r.v)} aria-pressed={a} style={{
            height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '8px 6px', border: 0, borderLeft: i ? '2px solid var(--color-divider)' : '0',
            background: a ? (r.v > 0 ? 'var(--color-accent)' : 'var(--color-text)') : 'var(--color-bg)',
            color: a ? 'var(--color-bg)' : 'var(--color-text)', font: 'inherit', textAlign: 'left', cursor: 'pointer',
          }}>
            <span style={{ fontSize: symSize, fontWeight: 800, lineHeight: 1 }}>{r.s}</span>
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.15 }}>{r.l}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tag colours for a rating: cool → neutral, right → ink, warm → accent. */
export function rTone(v: number | null): [string, string] {
  return v == null ? ['var(--color-neutral-200)', 'var(--color-neutral-800)']
    : v < 0 ? ['var(--color-neutral-200)', 'var(--color-neutral-900)']
    : v === 0 ? ['var(--color-text)', 'var(--color-bg)']
    : ['var(--color-accent-100)', 'var(--color-accent-800)'];
}
export function rLabel(v: number | null) {
  return v == null ? 'Not rated' : RATINGS.find(r => r.v === v)!.l;
}

export const bgImg = (url: string) => (url ? `url("${url}")` : 'none');
