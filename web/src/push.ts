// Web Push subscription for this phone.
import { api } from './store.ts';

export type Perm = 'granted' | 'denied' | 'default' | 'none';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

export const permission = (): Perm => (pushSupported() ? Notification.permission : 'none');

/** iOS only offers push to Home Screen apps. */
export const isIosBrowserTab = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(navigator as any).standalone;

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function subscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    const { key } = await api<{ key: string }>('GET', '/api/push/key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  return sub;
}

/** Ask for permission (call from a tap) and register this phone with the server. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return false;
  const sub = await subscription(true);
  if (!sub) return false;
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

/** On launch: make sure the server still has this phone's subscription. */
export async function resyncPush() {
  if (permission() !== 'granted') return;
  try {
    const sub = await subscription(true);
    if (sub) await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
  } catch { /* offline */ }
}

/** Sends a real push to this phone. Returns false if push isn't set up here. */
export async function sendTestPush(): Promise<boolean> {
  try {
    if (!(await enablePush())) return false;
    const sub = await subscription(false);
    if (!sub) return false;
    const r = await api<{ sent: number }>('POST', '/api/push/test', { endpoint: sub.endpoint });
    return r.sent > 0;
  } catch {
    return false;
  }
}
