import fs from 'node:fs';
import https from 'node:https';
import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { HOST, PASSCODE, PORT, TLS_CERT, TLS_KEY } from './config.ts';
import { startReminderCron } from './push.ts';

if (!PASSCODE) {
  console.error('HOUSEHOLD_PASSCODE is not set. Set it in .env or the environment; nobody can sign in without it.');
}

const tls = TLS_CERT && TLS_KEY;
const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
  ...(tls ? { createServer: https.createServer, serverOptions: { cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) } } : {}),
}, info => {
  console.log(`Sleep Outfit listening on ${tls ? 'https' : 'http'}://${info.address}:${info.port}`);
});

const cron = startReminderCron();

const shutdown = () => {
  clearInterval(cron);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
