import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import sharp from 'sharp';
import { getConnInfo } from '@hono/node-server/conninfo';
import { PHOTO_DIR, WEB_DIR } from './config.ts';
import { db, getRow, getSettings, listAll, putSettings, remove, upsert, type Kind } from './db.ts';
import { clearFailures, endSession, hasSession, noteFailure, passcodeMatches, requireSession, sameOrigin, startSession, throttled } from './auth.ts';
import { postcode, weather } from './proxy.ts';
import { deleteSubscription, saveSubscription, sendTest, vapidPublicKey } from './push.ts';
import { sanitizeItem, sanitizeNap, sanitizeNight, sanitizeSettings } from './sanitize.ts';
import type { Item } from '../shared/model.ts';

export const app = new Hono();

app.get('/healthz', c => c.text('ok'));

// ── API ──────────────────────────────────────────────────────────────
const api = new Hono();
api.use('*', sameOrigin);

api.post('/login', async c => {
  let ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '';
  if (!ip) { try { ip = getConnInfo(c).remote.address || ''; } catch { ip = ''; } }
  if (throttled(ip)) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  const body = await c.req.json().catch(() => ({}));
  if (!passcodeMatches(String(body.passcode ?? ''))) {
    noteFailure(ip);
    return c.json({ error: 'That passcode isn’t right.' }, 401);
  }
  clearFailures(ip);
  startSession(c);
  return c.json({ ok: true });
});

api.post('/logout', c => { endSession(c); return c.json({ ok: true }); });
api.get('/session', c => c.json({ ok: hasSession(c) }));

api.use('*', requireSession);

api.get('/state', c => c.json({
  settings: getSettings(),
  items: listAll('items'),
  nights: listAll('nights'),
  naps: listAll('naps'),
  serverTime: Date.now(),
}));

api.put('/settings', async c => {
  const s = sanitizeSettings(await c.req.json());
  return c.json(putSettings(s));
});

function removePhotoIfUnused(url: string | undefined) {
  if (!url || !url.startsWith('/photos/')) return;
  const used = listAll('items').some(i => i.photoUrl === url);
  if (used) return;
  const file = path.join(PHOTO_DIR, path.basename(url));
  fs.rm(file, { force: true }, () => {});
}

function crud(kind: Kind, sanitize: (raw: any, id?: string) => any, allowDelete = true) {
  const save = async (c: any, id?: string) => {
    const rec = sanitize(await c.req.json(), id);
    if (!rec) return c.json({ error: 'invalid record' }, 400);
    const before = kind === 'items' ? (getRow('items', rec.id)?.data as Item | undefined) : undefined;
    const { stored, applied } = upsert(kind, rec);
    if (applied && before && before.photoUrl !== rec.photoUrl) removePhotoIfUnused(before.photoUrl);
    return c.json({ record: stored, applied });
  };
  api.post(`/${kind}`, c => save(c));
  api.put(`/${kind}/:id`, c => save(c, c.req.param('id')));
  if (allowDelete) {
    api.delete(`/${kind}/:id`, c => {
      const id = c.req.param('id');
      const updatedAt = Number(c.req.query('updatedAt')) || Date.now();
      const before = kind === 'items' ? (getRow('items', id)?.data as Item | undefined) : undefined;
      const ok = remove(kind, id, updatedAt);
      if (ok && before) removePhotoIfUnused(before.photoUrl);
      return c.json({ ok });
    });
  }
}
crud('items', sanitizeItem);
crud('nights', sanitizeNight);
crud('naps', sanitizeNap, false);

api.post('/photos', async c => {
  const form = await c.req.parseBody();
  const file = form.photo;
  if (!(file instanceof File)) return c.json({ error: 'no photo' }, 400);
  if (file.size > 25 * 1024 * 1024) return c.json({ error: 'photo too large' }, 413);
  const name = crypto.randomUUID() + '.jpg';
  try {
    await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(path.join(PHOTO_DIR, name));
  } catch {
    return c.json({ error: 'Could not read that image.' }, 415);
  }
  return c.json({ url: '/photos/' + name });
});

api.get('/weather', async c => {
  const lat = Number(c.req.query('lat')), lon = Number(c.req.query('lon'));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ error: 'bad lat/lon' }, 400);
  try {
    return c.json(await weather(lat, lon));
  } catch (e) {
    return c.json({ error: 'forecast unavailable' }, 502);
  }
});

api.get('/postcode/:pc', async c => {
  const pc = c.req.param('pc');
  if (!/^[A-Za-z0-9 ]{2,10}$/.test(pc)) return c.json({ status: 400, error: 'Invalid postcode' }, 400);
  try {
    return c.json(await postcode(pc));
  } catch {
    return c.json({ status: 502, error: 'lookup failed' }, 502);
  }
});

api.get('/push/key', c => c.json({ key: vapidPublicKey }));
api.post('/push/subscribe', async c => {
  const body = await c.req.json().catch(() => ({}));
  const sub = body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    return c.json({ error: 'invalid subscription' }, 400);
  }
  saveSubscription({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
  return c.json({ ok: true });
});
api.post('/push/unsubscribe', async c => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.endpoint === 'string') deleteSubscription(body.endpoint);
  return c.json({ ok: true });
});
api.post('/push/test', async c => {
  const body = await c.req.json().catch(() => ({}));
  const sent = typeof body.endpoint === 'string' ? await sendTest(body.endpoint) : 0;
  return c.json({ sent });
});

app.route('/api', api);
app.all('/api/*', c => c.json({ error: 'not found' }, 404));

// ── Photos (private) ────────────────────────────────────────────────
app.get('/photos/:name', requireSession, c => {
  const name = c.req.param('name');
  if (!/^[0-9a-f-]{36}\.jpg$/.test(name)) return c.notFound();
  const file = path.join(PHOTO_DIR, name);
  if (!fs.existsSync(file)) return c.notFound();
  return c.body(fs.readFileSync(file), 200, {
    'content-type': 'image/jpeg',
    'cache-control': 'private, max-age=31536000, immutable',
  });
});

// ── PWA ─────────────────────────────────────────────────────────────
app.use('/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
app.use('/sw.js', async (c, next) => {
  await next();
  c.header('cache-control', 'no-cache');
});
app.use('*', serveStatic({ root: path.relative(process.cwd(), WEB_DIR) || '.' }));
// SPA fallback for /, /forecast, /nap, /morning, /wardrobe, /history
app.get('*', c => {
  const index = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(index)) return c.text('Build the PWA first: npm run build', 503);
  c.header('cache-control', 'no-cache');
  return c.html(fs.readFileSync(index, 'utf8'));
});

export { db };
