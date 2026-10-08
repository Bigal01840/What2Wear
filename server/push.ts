import fs from 'node:fs';
import path from 'node:path';
import webpush, { type PushSubscription } from 'web-push';
import { DATA_DIR, TZ } from './config.ts';
import { db, getMeta, getSettings, setMeta } from './db.ts';

// VAPID keys come from the environment, or are generated once and kept in ./data.
function loadVapid() {
  const env = process.env;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const file = path.join(DATA_DIR, 'vapid.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.log(`Generated VAPID keys in ${file}`);
  return keys;
}

const vapid = loadVapid();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

export const vapidPublicKey: string = vapid.publicKey;

export function saveSubscription(sub: PushSubscription) {
  db.prepare(`INSERT INTO push_subs (endpoint, data, created_at) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data`).run(sub.endpoint, JSON.stringify(sub), Date.now());
}

export function deleteSubscription(endpoint: string) {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
}

function reminderPayload() {
  const child = getSettings().child || 'Our toddler';
  return JSON.stringify({
    title: `How did ${child} sleep?`,
    body: 'Tap to rate last night and add the morning room reading.',
    url: '/morning',
    tag: 'morning-reminder',
  });
}

async function sendTo(subs: PushSubscription[], payload: string) {
  let sent = 0;
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 4 * 3600, urgency: 'high' });
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) deleteSubscription(sub.endpoint);
      else console.error('push failed', e?.statusCode || '', e?.body || e?.message || e);
    }
  }));
  return sent;
}

export function allSubscriptions(): PushSubscription[] {
  return db.prepare('SELECT data FROM push_subs').all().map((r: any) => JSON.parse(r.data));
}

export function sendTest(endpoint: string) {
  const row = db.prepare('SELECT data FROM push_subs WHERE endpoint = ?').get(endpoint) as any;
  if (!row) return Promise.resolve(0);
  return sendTo([JSON.parse(row.data)], reminderPayload());
}

/** Current date and HH:MM in Europe/London. */
export function londonNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
}

export function hasUnratedNight(today: string): boolean {
  return !!db.prepare(`SELECT 1 FROM nights WHERE deleted = 0 AND date < ? AND json_extract(data, '$.rating') IS NULL LIMIT 1`).get(today);
}

/**
 * Runs every 30s. Sends the morning reminder once per day at settings.remindAt
 * (Europe/London) if a night is still unrated. If the server was down at that
 * minute it catches up for up to two hours.
 */
export async function reminderTick(now = new Date()) {
  const s = getSettings();
  if (!s.remind) return;
  const [h, m] = String(s.remindAt || '07:00').split(':').map(Number);
  const at = (h || 0) * 60 + (m || 0);
  const { date, minutes } = londonNow(now);
  if (minutes < at || minutes > at + 120) return;
  if (getMeta('lastReminder') === date) return;
  setMeta('lastReminder', date);
  if (!hasUnratedNight(date)) return;
  const n = await sendTo(allSubscriptions(), reminderPayload());
  console.log(`Morning reminder sent to ${n} device(s)`);
}

export function startReminderCron() {
  const run = () => reminderTick().catch(e => console.error('reminder tick', e));
  run();
  return setInterval(run, 30_000);
}
