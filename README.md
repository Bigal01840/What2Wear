# Sleep Outfit

A private two-parent PWA that recommends what our toddler wears to bed: base layer, sleepwear, sleeping bag TOG and socks. It works from the nursery temperature, humidity, radiator setting, door, health and the Met Office 7pm–7am forecast, then learns from each morning's rating.

- **PWA:** Vite + React + TypeScript (`web/`). It's installable, works offline (IndexedDB cache plus an outbox that syncs on reconnect) and uses the Modernist design tokens.
- **Server:** Node + Hono (`server/`). It serves the PWA and a JSON API, stores data in SQLite (`better-sqlite3`) under `./data` and photos under `./data/photos` (480px, JPEG q82). It also proxies postcodes.io and Open-Meteo with a 30-minute cache and sends Web Push reminders.
- **Model:** `shared/model.ts` is a direct port of the prototype's logic, used by both client and server.

**Hosting and phone install:** see [docs/HOSTING.md](docs/HOSTING.md). It covers a Raspberry Pi with pm2 and Tailscale HTTPS, nightly backups, a Fly.io alternative, and installing on iPhone and Android.

## Develop

```sh
npm install
cp .env.example .env        # set HOUSEHOLD_PASSCODE
npm run seed                # dev only: the prototype's sample wardrobe, 6 nights and 2 naps
npm run dev                 # API on :3000, PWA on http://localhost:5173 (proxied)
```

| Script | |
|---|---|
| `npm run dev` | Server (tsx watch) and Vite dev server |
| `npm run build` | PWA → `dist/web`, server → `dist/server/main.js` |
| `npm start` | Run the production build |
| `npm test` | Vitest: model (`overnight`, `baseTog`, `learnFrom`, `combos` against the seed data), proxies, reminder cron |
| `npm run typecheck` | `tsc` for app, server and service worker |
| `npm run seed [-- --force]` | Load sample data. Refuses when `NODE_ENV=production` |
| `npm run backup` | Snapshot the database and photos into `./backups` |
| `npm run icons` | Regenerate the app icons |

The production database starts empty. Tonight then shows **Add your first sleeping bag**.

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `HOUSEHOLD_PASSCODE` | — | **Required.** Entered once per phone; gives a 400-day httpOnly cookie. |
| `DATA_DIR` | `./data` | SQLite file, photos, generated VAPID keys |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Bind to the Tailscale IP to keep it off the LAN |
| `TLS_CERT` / `TLS_KEY` | — | Serve HTTPS directly (e.g. from `tailscale cert`) |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact for push services |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated | Generated once into `$DATA_DIR/vapid.json` if unset |

## API

All routes except login need the session cookie. Writes must come from the same origin.

```
POST   /api/login              {passcode} → sets cookie
POST   /api/logout
GET    /api/state              → {settings, items, nights, naps}
PUT    /api/settings           {…, updatedAt}
POST   /api/items              PUT /api/items/:id     DELETE /api/items/:id?updatedAt=
POST   /api/nights             PUT /api/nights/:id    DELETE /api/nights/:id?updatedAt=
POST   /api/naps               PUT /api/naps/:id
POST   /api/photos             multipart "photo" → {url}
GET    /photos/:file           (private, cached by the service worker)
GET    /api/weather?lat&lon    → {source: 'Met Office'|'Open-Meteo', time[], temperature_2m[]}
GET    /api/postcode/:pc       → postcodes.io response
GET    /api/push/key           → VAPID public key
POST   /api/push/subscribe     {subscription}
POST   /api/push/unsubscribe   {endpoint}
POST   /api/push/test          {endpoint} → sends the reminder to that phone
```

**Sync:** records carry `updatedAt`, and the server keeps the newest write for each record (last write wins). Deletes are tombstones, so a stale offline edit can't bring a record back.

**Reminders:** every 30 seconds the server checks Europe/London time. At `settings.remindAt`, if reminders are on and a night before today is unrated, it pushes "How did {child} sleep?" to every subscribed phone, once per day. If the server was down at that minute it catches up within 2 hours. Tapping the notification opens `/morning`. If the app is already in the foreground, the in-app banner appears instead.

## Layout

```
shared/   model.ts (ported logic + types), seed.ts (dev seed)
server/   main.ts, app.ts (routes), db.ts, auth.ts, proxy.ts, push.ts, sanitize.ts
web/      index.html, vite.config.ts, src/ (App, store/sync, screens, service worker)
scripts/  seed.ts, backup.sh/.mjs, renew-cert.sh, build-server.mjs, make-icons.mjs
tests/    model, proxy and reminder tests
```
