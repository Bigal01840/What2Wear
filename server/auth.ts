import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from './db.ts';
import { PASSCODE } from './config.ts';

const COOKIE = 'so_sid';
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days

function hash(s: string) {
  return crypto.createHash('sha256').update(s).digest();
}

export function passcodeMatches(input: string): boolean {
  if (!PASSCODE) return false;
  return crypto.timingSafeEqual(hash(input), hash(PASSCODE));
}

function isHttps(c: Context) {
  return c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
}

export function startSession(c: Context) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, created_at, last_seen) VALUES (?, ?, ?)').run(token, now, now);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/', maxAge: MAX_AGE });
}

export function endSession(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  deleteCookie(c, COOKIE, { path: '/' });
}

export function hasSession(c: Context): boolean {
  const token = getCookie(c, COOKIE);
  if (!token) return false;
  const row = db.prepare('SELECT last_seen FROM sessions WHERE token = ?').get(token) as any;
  if (!row) return false;
  const now = Date.now();
  // Sliding expiry: refresh the cookie at most once a day.
  if (now - row.last_seen > 24 * 3600e3) {
    db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(now, token);
    setCookie(c, COOKIE, token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/', maxAge: MAX_AGE });
  }
  return true;
}

export const requireSession: MiddlewareHandler = async (c, next) => {
  if (!hasSession(c)) return c.json({ error: 'unauthorised' }, 401);
  await next();
};

/** Reject cross-site writes: a browser Origin header must match the Host we were reached on. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const host = c.req.header('x-forwarded-host') || c.req.header('host');
    if (origin && host && new URL(origin).host !== host) return c.json({ error: 'bad origin' }, 403);
  }
  await next();
};

// Simple login throttle: 10 failed attempts per IP per 15 minutes.
const fails = new Map<string, { n: number; until: number }>();
export function throttled(ip: string): boolean {
  const f = fails.get(ip);
  return !!f && f.n >= 10 && f.until > Date.now();
}
export function noteFailure(ip: string) {
  const f = fails.get(ip);
  const now = Date.now();
  if (!f || f.until < now) fails.set(ip, { n: 1, until: now + 15 * 60e3 });
  else f.n++;
}
export function clearFailures(ip: string) {
  fails.delete(ip);
}
