// History charts: what the model has learned and how well it's doing.
// Modernist styling: ink for the standard/reference, accent for what's learned about her,
// square marks, recessive grid, every series also told apart by line style or marker shape.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { LEARNING_RATE, RATINGS, baseTog, dayLabel, f1, learnFrom, sgn, type Night } from '../../../shared/model.ts';

const W = 350;
const INK = 'var(--color-text)', ACCENT = 'var(--color-accent)', GRID = 'var(--color-neutral-300)', MUTED = 'var(--color-neutral-700)';
const tick: CSSProperties = { fontSize: 10, fill: MUTED };
const short = (date: string) => dayLabel(date).replace(/^\w+, /, '');
const tempOf = (n: Night) => (n.actual ?? n.overnight) as number;

export function Legend({ items }: { items: [CSSProperties, string][] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 11, padding: '6px 0 4px', color: 'var(--color-neutral-800)' }}>
      {items.map(([sw, l]) => <span key={l} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ flex: 'none', ...sw }} />{l}</span>)}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ padding: '14px 20px 10px', borderBottom: '2px solid var(--color-divider)' }}>
      <h6 style={{ margin: '0 0 2px' }}>{title}</h6>
      {sub && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.4, marginBottom: 6, textWrap: 'pretty' } as CSSProperties}>{sub}</div>}
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, color: MUTED, padding: '10px 12px', background: 'var(--color-surface)' }}>{children}</div>;
}

// ── Headline numbers ────────────────────────────────────────────────

export function StatRow({ nights, learnedFrom, mornings }: { nights: Night[]; learnedFrom: number; mornings: number }) {
  const rated = nights.filter(n => n.rating != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const right = rated.filter(n => n.rating === 0).length;
  const checked = nights.filter(n => n.morningRoom != null && n.actual != null && n.overnight != null)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const err = checked.length ? checked.reduce((a, n) => a + Math.abs(n.overnight - (n.actual as number)), 0) / checked.length : null;
  const cell = (big: string, label: string, i: number) => (
    <div key={i} style={{ padding: '12px 12px 12px ' + (i ? '12px' : '20px'), borderLeft: i ? '2px solid var(--color-divider)' : 0 }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>{big}</div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderBottom: '2px solid var(--color-divider)' }}>
      {cell(rated.length ? Math.round((right / rated.length) * 100) + '%' : '—', rated.length ? `just right, last ${rated.length} night${rated.length === 1 ? '' : 's'}` : 'just right (no ratings yet)', 0)}
      {cell(err == null ? '—' : '±' + f1(err) + '°', err == null ? 'overnight estimate error (needs morning readings)' : `overnight estimate error, last ${checked.length}`, 1)}
      {cell(String(learnedFrom), `rated nights · ${mornings} morning reading${mornings === 1 ? '' : 's'}`, 2)}
    </div>
  );
}

// ── TOG worn vs overnight room temp ─────────────────────────────────

const FX = (t: number) => 34 + (Math.max(14, Math.min(26, t)) - 14) / 12 * 300;
const FY = (v: number) => 176 - (Math.max(0, Math.min(4, v)) / 4) * 156;
const TEMPS: number[] = [];
for (let t = 14; t <= 26; t += 0.5) TEMPS.push(t);

export function FitChart({ nights, offsetAt, tonight, child, learned }: {
  nights: Night[];
  offsetAt: (t: number) => { offset: number; near: number };
  tonight: { ov: number; tog: number } | null;
  child: string;
  learned: boolean;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const rated = nights.filter(n => n.rating != null && isFinite(tempOf(n))).sort((a, b) => b.date.localeCompare(a.date));
  // Spread of what the nights said vs the guide: wide when ratings disagree.
  const res = rated.map(n => (n.tog - (n.rating as number) * 0.3) - baseTog(tempOf(n)));
  const mean = res.length ? res.reduce((a, b) => a + b, 0) / res.length : 0;
  const spread = res.length >= 3 ? Math.sqrt(res.reduce((a, r) => a + (r - mean) ** 2, 0) / (res.length - 1)) : 0.4;
  const curve = TEMPS.map(t => ({ t, ...offsetAt(t) }));
  const half = (near: number) => Math.min(1, (0.15 + spread) / Math.sqrt(1 + near));
  const band = rated.length ? [
    ...curve.map(c => `${FX(c.t)},${FY(baseTog(c.t) + c.offset + half(c.near))}`),
    ...curve.slice().reverse().map(c => `${FX(c.t)},${FY(baseTog(c.t) + c.offset - half(c.near))}`),
  ].join(' ') : '';
  const picked = rated.find(n => n.id === sel);

  return (
    <Section title="TOG worn vs overnight room temp"
      sub={`Each square is a rated night. The red line is what it now recommends for ${child}; the shaded band shows how sure it is, narrowing where there are more nights. Tap a square for details.`}>
      <div onClick={() => setSel(null)}>
        <svg width={W} height="222" viewBox={`0 0 ${W} 222`} style={{ display: 'block', fontFamily: 'var(--font-body)', maxWidth: '100%', height: 'auto' }}
          role="img" aria-label="Chart of TOG worn against overnight room temperature">
          <text x="30" y="9" style={{ ...tick, fill: 'var(--color-neutral-800)' }}>Total TOG</text>
          {[0, 1, 2, 3, 4].map(v => (
            <g key={v}>
              <line x1="30" x2="338" y1={FY(v)} y2={FY(v)} style={{ stroke: GRID, strokeWidth: 1 }} />
              <text x="8" y={FY(v) + 3} style={tick}>{v}</text>
            </g>
          ))}
          {[14, 16, 18, 20, 22, 24, 26].map(t => (
            <g key={t}>
              <line x1={FX(t)} x2={FX(t)} y1={FY(4)} y2={FY(0)} style={{ stroke: GRID, strokeWidth: 1, strokeDasharray: '1 3' }} />
              <text x={FX(t)} y="192" textAnchor="middle" style={tick}>{t}°</text>
            </g>
          ))}
          <text x={FX(20)} y="214" textAnchor="middle" style={{ ...tick, fill: 'var(--color-neutral-800)' }}>Overnight room temperature (°C)</text>
          {band && <polygon points={band} style={{ fill: ACCENT, fillOpacity: 0.1, stroke: 'none' }} />}
          <polyline points={TEMPS.map(t => FX(t) + ',' + FY(baseTog(t))).join(' ')} style={{ fill: 'none', stroke: INK, strokeWidth: 1.5 }} />
          {learned && <polyline points={curve.map(c => FX(c.t) + ',' + FY(baseTog(c.t) + c.offset)).join(' ')} style={{ fill: 'none', stroke: ACCENT, strokeWidth: 2, strokeDasharray: '5 4' }} />}
          {tonight && (
            <g>
              <line x1={FX(tonight.ov)} x2={FX(tonight.ov)} y1={FY(4)} y2={FY(0)} style={{ stroke: 'var(--color-neutral-500)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <text x={Math.min(FX(tonight.ov) + 4, 300)} y={FY(4) + 10} style={{ ...tick, fontWeight: 600, fill: INK }}>Tonight {f1(tonight.ov)}°</text>
              <circle cx={FX(tonight.ov)} cy={FY(tonight.tog)} r="5.5" style={{ fill: 'var(--color-bg)', stroke: ACCENT, strokeWidth: 2.5 }} />
            </g>
          )}
          {rated.slice().reverse().map(n => {
            const i = rated.indexOf(n);
            const size = n.health && n.health.length ? 8 : 10;
            const x = FX(tempOf(n)), y = FY(n.tog);
            return (
              <g key={n.id} onClick={e => { e.stopPropagation(); setSel(sel === n.id ? null : n.id); }} style={{ cursor: 'pointer' }}>
                <rect x={x - 12} y={y - 12} width="24" height="24" style={{ fill: 'transparent' }} />
                <rect x={x - size / 2} y={y - size / 2} width={size} height={size}
                  style={{
                    opacity: Math.max(0.35, Math.pow(0.93, i)),
                    fill: n.rating! < 0 ? 'var(--color-bg)' : n.rating === 0 ? INK : ACCENT,
                    stroke: n.id === sel ? INK : n.rating! > 0 ? ACCENT : INK, strokeWidth: n.id === sel ? 3 : 2,
                  }} />
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ minHeight: 38, padding: '7px 10px', background: picked ? INK : 'var(--color-surface)', color: picked ? 'var(--color-bg)' : MUTED, fontSize: 12, lineHeight: 1.35 }}>
        {picked ? (
          <>
            <b>{dayLabel(picked.date)}</b> · {f1(tempOf(picked))}° overnight · wore {f1(picked.tog)} TOG · {RATINGS.find(r => r.v === picked.rating)?.l}
            {picked.health && picked.health.length ? ' · ' + picked.health.join(', ') : ''}
          </>
        ) : 'Tap a square to see that night.'}
      </div>
      <Legend items={[
        [{ width: 14, height: 2, background: INK }, 'Standard guide'],
        [{ width: 14, height: 0, borderTop: `2px dashed ${ACCENT}` }, `Adjusted for ${child}`],
        [{ width: 14, height: 9, background: ACCENT, opacity: 0.15 }, 'How sure'],
        [{ width: 9, height: 9, borderRadius: '50%', border: `2.5px solid ${ACCENT}` }, 'Tonight'],
        [{ width: 9, height: 9, border: `2px solid ${INK}` }, 'Cool'],
        [{ width: 9, height: 9, background: INK }, 'Right'],
        [{ width: 9, height: 9, background: ACCENT }, 'Warm'],
        [{ width: 9, height: 9, background: INK, opacity: 0.35 }, 'Faded = older'],
      ]} />
    </Section>
  );
}

// ── How the learning has moved ──────────────────────────────────────

export function OffsetTimeline({ nights, child }: { nights: Night[]; child: string }) {
  const rated = nights.filter(n => n.rating != null).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const sub = `The overall adjustment after each rated night. Above the line, ${child} needed more than the standard chart; below, less. It should settle as nights add up.`;
  if (rated.length < 2) return <Section title="How the learning has moved" sub={sub}><Empty>Appears after 2 rated nights.</Empty></Section>;
  const series = rated.map((n, k) => ({ n, off: learnFrom(rated.slice(0, k + 1), LEARNING_RATE, null).offset }));
  const lim = Math.max(0.6, Math.ceil((Math.max(...series.map(p => Math.abs(p.off))) + 0.1) * 5) / 5);
  const H = 150, top = 20, bottom = 120;
  const X = (k: number) => 40 + (series.length === 1 ? 150 : (k / (series.length - 1)) * 296);
  const Y = (v: number) => top + ((lim - v) / (2 * lim)) * (bottom - top);
  const last = series[series.length - 1];
  const ticks = [lim, lim / 2, 0, -lim / 2, -lim];
  return (
    <Section title="How the learning has moved" sub={sub}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: 'var(--font-body)', maxWidth: '100%', height: 'auto' }}
        role="img" aria-label={`Adjustment over ${series.length} rated nights, now ${sgn(last.off)} TOG`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1="30" x2="346" y1={Y(v)} y2={Y(v)} style={{ stroke: v === 0 ? INK : GRID, strokeWidth: v === 0 ? 1.5 : 1 }} />
            <text x="0" y={Y(v) + 3} style={tick}>{sgn(v)}</text>
          </g>
        ))}
        <text x="346" y={Y(0) + 13} textAnchor="end" style={{ ...tick, fill: 'var(--color-neutral-800)' }}>Standard guide</text>
        <polyline points={series.map((p, k) => X(k) + ',' + Y(p.off)).join(' ')} style={{ fill: 'none', stroke: ACCENT, strokeWidth: 2 }} />
        {series.map((p, k) => <rect key={p.n.id} x={X(k) - 3} y={Y(p.off) - 3} width="6" height="6" style={{ fill: ACCENT }} />)}
        <text x="346" y={top + 2} textAnchor="end" style={{ fontSize: 11, fontWeight: 800, fill: INK }}>Now {sgn(last.off)} TOG</text>
        <text x="34" y={H - 12} style={tick}>{short(series[0].n.date)}</text>
        <text x="346" y={H - 12} textAnchor="end" style={tick}>{short(last.n.date)}</text>
        <text x={190} y={H - 12} textAnchor="middle" style={tick}>{series.length} rated nights</text>
      </svg>
    </Section>
  );
}

// ── Overnight estimate vs measured ──────────────────────────────────

export function EstimateChart({ nights }: { nights: Night[] }) {
  const pts = nights.filter(n => n.morningRoom != null && n.actual != null && isFinite(n.overnight))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const sub = 'What the app expected the room to average overnight (at bedtime) against what the bedtime and morning readings show. The gap should shrink as it learns how your nursery cools.';
  if (pts.length < 2) {
    return <Section title="Overnight estimate vs measured" sub={sub}><Empty>Appears once 2 nights have a morning room reading.</Empty></Section>;
  }
  const vals = pts.flatMap(n => [n.overnight, n.actual as number]);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const H = 160, top = 10, bottom = 128;
  const X = (k: number) => 40 + (k / (pts.length - 1)) * 268;
  const Y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const step = hi - lo > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const lastK = pts.length - 1, last = pts[lastK];
  return (
    <Section title="Overnight estimate vs measured" sub={sub}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: 'var(--font-body)', maxWidth: '100%', height: 'auto' }}
        role="img" aria-label="Estimated against measured overnight room temperature for recent nights">
        {ticks.map(v => (
          <g key={v}>
            <line x1="34" x2="346" y1={Y(v)} y2={Y(v)} style={{ stroke: GRID, strokeWidth: 1 }} />
            <text x="0" y={Y(v) + 3} style={tick}>{v}°</text>
          </g>
        ))}
        {pts.map((n, k) => <line key={'g' + n.id} x1={X(k)} x2={X(k)} y1={Y(n.overnight)} y2={Y(n.actual as number)} style={{ stroke: 'var(--color-neutral-400)', strokeWidth: 3 }} />)}
        <polyline points={pts.map((n, k) => X(k) + ',' + Y(n.overnight)).join(' ')} style={{ fill: 'none', stroke: INK, strokeWidth: 1.5, strokeDasharray: '4 3' }} />
        <polyline points={pts.map((n, k) => X(k) + ',' + Y(n.actual as number)).join(' ')} style={{ fill: 'none', stroke: ACCENT, strokeWidth: 2 }} />
        {pts.map((n, k) => (
          <g key={n.id}>
            <rect x={X(k) - 4} y={Y(n.overnight) - 4} width="8" height="8" style={{ fill: 'var(--color-bg)', stroke: INK, strokeWidth: 2 }} />
            <rect x={X(k) - 4} y={Y(n.actual as number) - 4} width="8" height="8" style={{ fill: ACCENT }} />
          </g>
        ))}
        <text x={X(lastK) + 7} y={Y(last.actual as number) + 4} style={{ fontSize: 10, fontWeight: 800, fill: INK }}>{f1(last.actual as number)}°</text>
        <text x={X(lastK) + 7} y={Y(last.overnight) + 4} style={{ fontSize: 10, fill: MUTED }}>{f1(last.overnight)}°</text>
        <text x="40" y={H - 12} style={tick}>{short(pts[0].date)}</text>
        <text x="308" y={H - 12} textAnchor="end" style={tick}>{short(last.date)}</text>
      </svg>
      <Legend items={[
        [{ width: 8, height: 8, border: `2px solid ${INK}` }, 'Estimated at bedtime'],
        [{ width: 8, height: 8, background: ACCENT }, 'Measured (bedtime + morning)'],
        [{ width: 3, height: 10, background: 'var(--color-neutral-400)' }, 'Gap'],
      ]} />
    </Section>
  );
}
