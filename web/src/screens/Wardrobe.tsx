import { CATS, LEGS, SLEEVES, TOG_HINT, f1, newId, r1, type Cat, type Item } from '../../../shared/model.ts';
import { sleeveTxt } from '../derive.ts';
import { api, deleteRecord, flash, saveRecord, setUi, type ItemDraft, type State } from '../store.ts';
import { Header, I, Seg, bgImg } from '../components/ui.tsx';
import { LOCAL } from '../config.ts';

export const newItemDraft = (cat: Cat): ItemDraft => ({
  id: '', name: '', cat, tog: '1.0', sleeve: 'none', legs: 'na', fabric: '', size: '', link: '', photoUrl: '', available: true, notes: '',
});

export function Wardrobe({ s }: { s: State }) {
  const items = s.data.items, f = s.ui.catFilter;
  const catOrder = CATS.map(c => c.id) as string[];
  const cards = items.filter(i => f === 'all' || i.cat === f)
    .sort((a, b) => catOrder.indexOf(a.cat) - catOrder.indexOf(b.cat) || a.tog - b.tog);
  const filters = [{ id: 'all', l: 'All' }].concat(CATS.map(c => ({ id: c.id, l: c.short })));

  return (
    <div>
      <Header
        kicker={`${items.length} items · ${items.filter(i => !i.available).length} in the wash`}
        title="Wardrobe"
        right={<button className="btn btn-primary" style={{ height: 44, gap: 6 }} onClick={() => setUi({ draft: newItemDraft(f !== 'all' ? (f as Cat) : 'bag'), draftErr: '' })}>{I.plus()}Add</button>}
      />
      <div className="scr" style={{ display: 'flex', gap: 6, padding: '12px 20px', overflowX: 'auto', borderBottom: '2px solid var(--color-divider)' }}>
        {filters.map(x => {
          const a = f === x.id;
          return (
            <button key={x.id} onClick={() => setUi({ catFilter: x.id })} aria-pressed={a} style={{ flex: 'none', height: 36, padding: '0 12px', border: `1px solid ${a ? 'var(--color-text)' : 'var(--color-divider)'}`, background: a ? 'var(--color-text)' : 'transparent', color: a ? 'var(--color-bg)' : 'var(--color-text)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{x.l}</button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 2, background: 'var(--color-divider)', borderBottom: '2px solid var(--color-divider)' }}>
        {cards.map(i => (
          <button key={i.id} className="hover-surface" onClick={() => setUi({ draft: { ...i, tog: String(i.tog) }, draftErr: '' })} style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: i.available ? 1 : 0.6 }}>
            <div style={{ width: '100%', aspectRatio: '1/1', background: 'var(--color-surface)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 10 }}>
              {i.photoUrl ? (
                <div className="grayscale" role="img" aria-label="Item photo" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: bgImg(i.photoUrl) }} />
              ) : (
                <>
                  <span className="lbl">{CATS.find(c => c.id === i.cat)!.label}</span>
                  <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: 'var(--color-neutral-500)' }}>{f1(i.tog)}</span>
                </>
              )}
              {!i.available && <span className="tag" style={{ position: 'absolute', top: 8, right: 8, background: 'var(--color-text)', color: 'var(--color-bg)' }}>In the wash</span>}
            </div>
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{i.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>{[f1(i.tog) + ' TOG', sleeveTxt[i.sleeve], i.size].filter(Boolean).join(' · ')}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Downscale on the phone first (480px long edge, JPEG q0.82) so uploads are small and HEIC is converted. */
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

export function ItemEditor({ s }: { s: State }) {
  const d = s.ui.draft!;
  const setD = (patch: Partial<ItemDraft>) => setUi(u => ({ draft: u.draft ? { ...u.draft, ...patch } : u.draft }));
  const field = (k: 'name' | 'tog' | 'fabric' | 'size' | 'link' | 'notes') => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ [k]: e.target.value }) });
  const preview = (d as any).preview as string | undefined;
  const shown = preview || d.photoUrl;

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrink(file);
      if (LOCAL) {
        // No server: keep the (small, 480px) photo inside the item itself.
        const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
        setD({ photoUrl: url });
        return;
      }
      setD({ uploading: true, preview: URL.createObjectURL(blob) } as any);
      const form = new FormData();
      form.append('photo', blob, 'photo.jpg');
      const { url } = await api<{ url: string }>('POST', '/api/photos', form);
      setD({ photoUrl: url, uploading: false, preview: undefined } as any);
    } catch {
      setD({ uploading: false, preview: undefined } as any);
      setUi({ draftErr: 'Couldn’t upload the photo. Check your connection and try again.' });
    }
  };

  const save = () => {
    const tg = parseFloat(d.tog);
    if (!d.name.trim()) return setUi({ draftErr: 'Give the item a name.' });
    if (isNaN(tg) || tg < 0 || tg > 5) return setUi({ draftErr: 'TOG should be a number between 0 and 5.' });
    if (d.uploading) return setUi({ draftErr: 'Wait for the photo to finish uploading.' });
    const { uploading, preview, ...rest } = d as any;
    const it: Item = { ...rest, name: d.name.trim(), tog: r1(tg), id: d.id || newId('i'), updatedAt: 0 };
    saveRecord('items', it);
    setUi({ draft: null, overrides: {} });
    flash(d.id ? 'Item updated' : 'Added to wardrobe');
  };

  return (
    <div style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: 0, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '2px solid var(--color-divider)' }}>
        <button className="btn btn-ghost" style={{ height: 44 }} onClick={() => setUi({ draft: null })}>Cancel</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>{d.id ? 'Edit item' : 'New item'}</div>
        <button className="btn btn-primary" style={{ height: 44 }} onClick={save}>Save</button>
      </div>
      <div className="scr overlay-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <label style={{ width: 120, height: 120, flex: 'none', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', padding: 10, gap: 4, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <input type="file" accept="image/*" onChange={onPhoto} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
            {shown ? (
              <div className="grayscale" role="img" aria-label="Item photo" style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: bgImg(shown), opacity: d.uploading ? 0.6 : 1 }} />
            ) : (
              <>{I.camera()}<span style={{ fontSize: 12, fontWeight: 600 }}>Add photo</span></>
            )}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--color-neutral-700)' }}>
            <span>{d.uploading ? 'Uploading…' : 'Tap to choose or take a photo.'}</span>
            {shown && !d.uploading && <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={e => { e.preventDefault(); setD({ photoUrl: '' }); }}>Remove photo</button>}
          </div>
        </div>
        <div className="field"><label htmlFor="it-name">Name</label><input id="it-name" className="input" style={{ minHeight: 44 }} placeholder="e.g. Grey stripe sleeping bag" {...field('name')} /></div>
        <div className="field">
          <label>Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 2, background: 'var(--color-divider)', border: '1px solid var(--color-divider)' }}>
            {CATS.map(c => {
              const a = d.cat === c.id;
              return <button key={c.id} onClick={() => setD({ cat: c.id })} aria-pressed={a} style={{ minHeight: 44, padding: '6px 10px', border: 0, background: a ? 'var(--color-accent)' : 'var(--color-bg)', color: a ? 'var(--color-bg)' : 'var(--color-text)', font: 'inherit', fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{c.label}</button>;
            })}
          </div>
        </div>
        <div className="field">
          <label htmlFor="it-tog">TOG rating</label>
          <input id="it-tog" className="input" style={{ minHeight: 44, maxWidth: 120 }} type="number" step="0.1" min="0" inputMode="decimal" {...field('tog')} />
          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 6, textWrap: 'pretty' } as any}>{TOG_HINT[d.cat]}</div>
        </div>
        <div className="field"><label>Sleeves</label><Seg name="sleeve" value={d.sleeve} opts={SLEEVES} onPick={v => setD({ sleeve: v })} minHeight={40} /></div>
        <div className="field"><label>Legs</label><Seg name="legs" value={d.legs} opts={LEGS} onPick={v => setD({ legs: v })} minHeight={40} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <div className="field"><label htmlFor="it-fabric">Fabric</label><input id="it-fabric" className="input" style={{ minHeight: 44 }} placeholder="Cotton" {...field('fabric')} /></div>
          <div className="field"><label htmlFor="it-size">Size</label><input id="it-size" className="input" style={{ minHeight: 44 }} placeholder="18–24m" {...field('size')} /></div>
        </div>
        <div className="field">
          <label htmlFor="it-link">Web link</label>
          <input id="it-link" className="input" style={{ minHeight: 44 }} type="url" placeholder="https://" {...field('link')} />
          {d.link && (
            <a href={/^https?:\/\//i.test(d.link) ? d.link : 'https://' + d.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 13, marginTop: 6 }}>Open link{I.external()}</a>
          )}
        </div>
        <div className="field"><label>Availability</label><Seg name="avail" value={d.available} opts={[[true, 'In the wardrobe'], [false, 'In the wash']]} onPick={v => setD({ available: v })} minHeight={40} /></div>
        <div className="field"><label htmlFor="it-notes">Notes</label><textarea id="it-notes" className="input" style={{ minHeight: 64 }} placeholder="Runs small, zip on the side…" {...field('notes')} /></div>
        {s.ui.draftErr && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>{s.ui.draftErr}</div>}
        {d.id && (
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', color: 'var(--color-accent-700)' }} onClick={() => { deleteRecord('items', d.id); setUi({ draft: null, overrides: {} }); flash('Item deleted'); }}>Delete item</button>
        )}
      </div>
    </div>
  );
}
