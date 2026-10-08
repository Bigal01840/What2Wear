import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'so-test-'));
vi.mock('web-push', () => {
  const sent: unknown[] = [];
  return {
    default: {
      generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
      setVapidDetails: () => {},
      sendNotification: vi.fn(async (sub: unknown, payload: string) => { sent.push(JSON.parse(payload)); }),
      __sent: sent,
    },
  };
});

let push: typeof import('../server/push.ts');
let db: typeof import('../server/db.ts');
let sent: any[];

beforeAll(async () => {
  db = await import('../server/db.ts');
  push = await import('../server/push.ts');
  sent = ((await import('web-push')).default as any).__sent;
  push.saveSubscription({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } });
});

const night = (date: string, rating: number | null) => ({
  id: 'n' + date, date, room: 20, outdoor: 9, thermo: 18, overnight: 19, items: [], tog: 2, rating, signs: [], note: '', updatedAt: 1,
});

describe('morning reminder cron', () => {
  it('reads London time across BST', () => {
    expect(push.londonNow(new Date('2026-07-01T06:00:00Z'))).toEqual({ date: '2026-07-01', minutes: 7 * 60 });
    expect(push.londonNow(new Date('2026-12-01T07:00:00Z'))).toEqual({ date: '2026-12-01', minutes: 7 * 60 });
  });

  it('does nothing when every night is rated', async () => {
    db.upsert('nights', night('2026-06-30', 0));
    await push.reminderTick(new Date('2026-07-01T06:00:00Z'));
    expect(sent).toHaveLength(0);
  });

  it('sends once at remindAt (Europe/London) when a night is unrated, deep-linking to /morning', async () => {
    db.upsert('nights', night('2026-07-01', null));
    await push.reminderTick(new Date('2026-07-02T05:59:00Z')); // 06:59 BST: too early
    expect(sent).toHaveLength(0);
    await push.reminderTick(new Date('2026-07-02T06:00:10Z')); // 07:00 BST
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: 'How did Our toddler sleep?', url: '/morning' });
    await push.reminderTick(new Date('2026-07-02T06:00:40Z'));
    expect(sent).toHaveLength(1); // once a day
  });

  it('respects a custom time and the On/Off setting', async () => {
    db.putSettings({ ...db.getSettings(), remindAt: '06:30', remind: false, updatedAt: Date.now() });
    await push.reminderTick(new Date('2026-07-03T05:30:00Z'));
    expect(sent).toHaveLength(1);
    db.putSettings({ ...db.getSettings(), remind: true, updatedAt: Date.now() + 1 });
    await push.reminderTick(new Date('2026-07-03T05:30:00Z'));
    expect(sent).toHaveLength(2);
  });
});
