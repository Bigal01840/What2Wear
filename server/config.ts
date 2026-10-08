import './env.ts';
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

export const DATA_DIR = path.resolve(env.DATA_DIR || './data');
export const PHOTO_DIR = path.join(DATA_DIR, 'photos');
export const DB_FILE = path.join(DATA_DIR, 'sleep-outfit.db');
export const WEB_DIR = path.resolve(env.WEB_DIR || './dist/web');

export const PORT = Number(env.PORT || 3000);
/** Bind address. On a home machine set this to the Tailscale IP so nothing on the LAN can reach it. */
export const HOST = env.HOST || '0.0.0.0';
export const TLS_CERT = env.TLS_CERT || '';
export const TLS_KEY = env.TLS_KEY || '';

export const PASSCODE = env.HOUSEHOLD_PASSCODE || '';
export const IS_PROD = env.NODE_ENV === 'production';
export const TZ = 'Europe/London';

fs.mkdirSync(PHOTO_DIR, { recursive: true });
