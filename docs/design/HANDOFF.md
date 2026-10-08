# Handoff: Sleep Outfit Assistant

## Overview
A private two-parent mobile web app (PWA) that recommends what a toddler should wear to bed (base layer, sleepwear, sleeping bag TOG, socks) based on nursery temperature, humidity, radiator thermostat, door position, health, and the 7pm–7am outdoor forecast. Parents log what was worn, rate it next morning (too cold → too warm), and the model learns a personal offset. It also has a 3-night outfit forecast with laundry warnings, a separate nap mode, a clothing catalogue with photos and links, editable history, and a 7am reminder.

**Goal of this build:** turn the prototype into a real app that both parents use from their own phones, with **one shared, persistent data store**, **hosted by us** (no third-party database), installable to the home screen, with real **7am push notifications**.

## About the design files
`Sleep Outfit.dc.html` is a **design reference built in HTML**. It's a working prototype that shows the intended look, copy, and behaviour. It is not production code. Recreate it in the stack below. You can lift all the logic (model, combo search, learning) almost verbatim from the `<script data-dc-script>` block at the bottom of the file. It's plain JS.

To view it, open `Sleep Outfit.dc.html` in a browser. It needs `support.js` next to it and the stylesheet at `_ds/modernist-a1fc3a71-5542-4624-8a62-3163c9bd4a71/styles.css`. A copy of that stylesheet is included here as `styles.css`.

## Fidelity
**High-fidelity.** Match colours, type, spacing, rules, and copy exactly. Design system: "Modernist". It's flat, uses Archivo throughout, has zero corner radius anywhere, uses 2px rules between sections, keeps all labels flush left (including inside buttons), and shows photos in greyscale.

---

## Recommended architecture (in-house, self-hosted)

- **Frontend:** a Vite + React + TypeScript PWA with a web app manifest and service worker. Use mobile layout only, at a 390px design width that stays fluid from 360 to 430px.
- **Backend:** a single Node service (Hono or Express) that serves the built PWA and a JSON API.
- **Database:** SQLite (`better-sqlite3`) in one file on the host. Back it up nightly by copying the file.
- **Auth:** two accounts with a household passcode. On first launch, enter the passcode to get a long-lived httpOnly session cookie. Nothing public.
- **Push:** Web Push with VAPID keys (`web-push` npm). The server runs a cron job at each user's reminder time (default 07:00, Europe/London) and sends "How did {child} sleep?" to every subscribed device. This works on Android Chrome. On iOS it works from 16.4 onwards, but only when the app has been added to the Home Screen.
- **Sync:** the server is the source of truth. The client caches data in IndexedDB for offline use and writes through the API. On reconnect, the most recent `updatedAt` wins for each record. That's fine for two users.
- **Hosting options, from most to least in-house:**
  1. **A home machine or Raspberry Pi** running the Node service under `pm2` or systemd. Expose it to both phones with **Tailscale**: install it on the Pi and both phones, then use Tailscale HTTPS certs (`tailscale cert`). Nothing is exposed to the internet. Push still works, because it goes out via Apple and Google push services.
  2. A **small VPS or Fly.io** app with a persistent volume for the SQLite file, behind HTTPS.
- **External APIs (no keys):**
  - Postcode → lat/lon: `https://api.postcodes.io/postcodes/{postcode}` → `result.latitude`, `result.longitude`, `result.admin_district`.
  - Weather (Met Office UKV via Open-Meteo): `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m&forecast_days=5&timezone=auto&models=ukmo_seamless`. If that comes back with no usable values, call the same URL without `models`. Proxy it through the backend and cache it for 30 minutes.

### API (suggested)
```
POST /api/login            {passcode} → sets cookie
GET  /api/state            → {settings, items, nights, naps}
PUT  /api/settings         {…}
POST /api/items            PUT /api/items/:id      DELETE /api/items/:id
POST /api/nights           PUT /api/nights/:id     DELETE /api/nights/:id
POST /api/naps             PUT /api/naps/:id
POST /api/photos           multipart → {url}   (store under /data/photos, resize to 480px long edge, JPEG q0.82)
GET  /api/weather          → proxied Open-Meteo hourly + source label
GET  /api/postcode/:pc     → proxied postcodes.io
POST /api/push/subscribe   {subscription}
```

---

## Data model

```ts
Item   { id, name, cat: 'bag'|'suit'|'pjs'|'body'|'socks', tog: number, sleeve: 'short'|'long'|'none',
         legs: 'footed'|'footless'|'shorts'|'na', fabric, size, link, photoUrl, available: boolean, notes, updatedAt }
Night  { id, date: 'YYYY-MM-DD', room, humidity, outdoor /*7pm–7am avg*/, outdoorRange:{min,max}|null, thermo,
         door: 'closed'|'open', overnight /*model estimate*/, items: string[], tog, target,
         rating: -2..2 | null, signs: string[], health: string[], note,
         morningRoom|null, morningHum|null, actual /*(room+morningRoom)/2 − 0.3 if door open*/, updatedAt }
Nap    { id, date, start:'HH:MM', end:'HH:MM', room, overnight /*effective temp*/, door, outdoor|null,
         items: string[], tog, rating|null, health: string[], updatedAt }
Settings { child, age /*months*/, postcode, city, lat, lon, learning: boolean, remind: boolean, remindAt:'HH:MM' }
```
Slot mapping: `bag→bag`, `suit|pjs→mid`, `body→base`, `socks→socks`. Slots in display order: Base layer, Sleepwear, Sleeping bag, Socks.

---

## The model (port exactly)

1. **Overnight room estimate**
   `b = min(room, max(thermo − 0.5, room − max(0, room − outdoor) × 0.12))`. If the door is open, use `b − 0.3`. Round to 0.1.
   `outdoor` is the mean of the hourly `temperature_2m` values from 19:00 today to 07:00 tomorrow (13 values), rounded to an integer. The range is the min and max of those values.
2. **Guide TOG**: linear interpolation through `[[14,3.5],[16,3],[18,2.5],[20,2],[22,1.3],[24,0.9],[26,0.5],[28,0.2]]`, clamped at both ends.
3. **Adjustments**: humidity of 75% or more gives −0.2, 65% or more gives −0.1. Fever gives −0.5.
4. **Learning offset** (`learnFrom(list, rate, door)`):
   - Take the rated records, newest first.
   - If filtering by door and at least 3 rated nights share the current door state (and they aren't all of them), use only those nights.
   - Each record's ideal TOG is `tog − rating × 0.3`. Its residual is `ideal − guide(actual ?? overnight ?? room)`.
   - The weight is `0.8^index`, times 0.2 if the night has any health marker.
   - `offset = weightedMean(residual) × n/(n+2) × rate`, rounded to 0.1. `rate` defaults to 1 and can be set from 0 to 2.
   - If learning is off in Settings, the offset is 0.
5. **Target** = `clamp(guide + offset + humidity adjustment + fever adjustment, 0.2, 4.5)`.
6. **Combo search**:
   - Use available items only (not in the wash).
   - Enumerate every combination of bag (required), base (optional), mid (optional) and socks (optional). Skip combinations that have neither a base nor a mid layer.
   - `score = |total − target| + penalties + 0.02 × layerCount`.
   - Penalties: overnight below 19 with no long sleeve: +0.3. Overnight above 23 with a long sleeve: +0.3. Socks when overnight is 18 or more: +0.2. Base and mid together when overnight is above 23: +0.15.
   - Sort ascending. The best result is the recommendation. The next 2 with distinct totals (more than 0.05 apart) are the alternatives.
7. **Swap**: the button on each layer cycles through `[None (not for bag), …available items in that slot sorted by TOG]`. Swaps are stored as overrides until the user taps "Back to recommended".
8. **Nap**: effective temp = `napRoom − 0.2` if the door is open (no overnight drift). The offset comes from naps once at least 2 are rated, and from the night offset until then. Show the top 3 distinct combos as a pick list.
9. **Forecast (next 3 nights)**: use the same overnight formula with tonight's room, thermostat and door, plus each night's 7pm–7am average, and the night offset. Then run the combo search twice: once on available items, and once with every item treated as available. If the all-items best beats the available best by more than 0.1 score, show a **Laundry** strip: "Wash the {in-wash item names} — it suits this night better ({tog} TOG)."
10. **Morning save**: record the rating, signs, health, note, `morningRoom`, `morningHum`, and `actual`. Then show the before/after offset message: "Saved {date}. Future picks are now a little warmer/cooler — {after} TOG vs the guide (was {before})."

Seed data for development (11 items, 6 nights, 2 naps) is in `seed()` in the prototype script. **Don't ship the seed data.** Start empty, with an onboarding prompt to add the first sleeping bag.

---

## Screens

The phone frame is 390×844 on `--color-bg` #f3f2f2. Layout from top to bottom: a 44px status area, a scrolling content area, then a 72px tab bar with a 2px top rule. There are 6 equal tabs, each with a 20px Lucide icon over an 11px/600 label, all flush left. The active tab uses accent #ec3013 with a 3px accent bar on top. The Morning tab shows an 8px accent square while a night is still unrated.

**Every screen header** has 16/20/14 padding and a 2px bottom rule. It has a kicker (11px, uppercase, letter-spacing 0.1em, `--color-accent-700` #ae1800) and an H1 (34px, weight 800, Archivo).

1. **Tonight**
   - Optional **pending banner**: full-width accent fill with text in the bg colour. It reads "How was last night?" and "Rate it so tonight's pick can learn from it", and leads to Morning.
   - A **2×2 grid** with 2px rules: Room now (number input + −/+ in 0.1 steps), Outside 7pm–7am (value + "Met Office · min–max°", −/+ in steps of 1), Radiator (input + −/+ in 0.5 steps), Humidity (input + −/+ in steps of 5).
     - Values are 30px/800 number inputs with a 2px neutral-300 underline that turns accent on focus. Steppers are 44×36 `.btn-secondary`.
   - **Nursery door** segmented control (Closed / Open).
   - **"Tonight {child} is"** chips: Teething, Unwell, Fever / high temp. Selected chips are filled ink with bg-coloured text.
   - If **Fever** is selected, show an accent-fill warning: "Fever: dress lighter", "Target lowered by 0.5 TOG. Don't add layers to "sweat it out". If you're worried, call NHS 111 or your GP."
   - A strip on the surface colour (#eae9e9) with two cells: "Expected overnight {x}°C in the room" and "Target warmth {x} TOG total".
   - The **outfit**:
     - Kicker "Dress {child} ({age}) in". Total TOG at 64px/800 in accent, with a tag reading "On target" (within 0.25) or "0.4 over/under".
     - Four layer rows separated by 1px rules: a 52px thumbnail (greyscale photo, or the TOG number), the slot label (11px uppercase), the name (15px/600), meta "{tog} TOG · Long sleeve", and a **Swap** button.
   - Primary button "Dressed — log tonight" (52px, full width, label flush left). Once logged it becomes a surface box: "Logged · {tog} TOG".
   - **Why this outfit**: numbered reasons separated by 1px rules.
   - **Also close**: 2 alternative rows ("Use" applies them).
2. **Forecast**: a note on assumptions, then one block per night. Each block has the date heading and "avg · range", a left cell with the TOG (36px accent) and "Room ≈ x°", a right cell listing the item names, and an optional Laundry strip (accent-100 background, accent-800 text).
3. **Nap**: Start/End time inputs, Room now plus Outside during nap, a Door segmented control, and a target strip. Then a "Pick an outfit" list of 3; the selected one has a 2px ink border and surface fill, and the first is tagged "Best fit". Then "Dressed — log this nap". While a nap is unrated, show "How was the nap?" with a 5-cell rating and Save. Then a Recent naps table.
4. **Morning check**:
   - A summary of the night (3 cells) and the items worn.
   - **Nursery this morning**: room and humidity inputs with steppers.
   - **5-cell rating**: −2 Too cold, −1 Bit cool, 0 Just right, +1 Bit warm, +2 Too warm. The cells are 2px-ruled. Selected cold or right cells are filled ink; selected warm cells are filled accent.
   - Sign chips: Woke in the night, Cold hands / chest, Sweaty neck, Flushed cheeks, Kicked about, Slept through.
   - Health chips, a Note field, and "Save and learn".
   - Empty state: "All nights rated".
5. **Wardrobe**:
   - Kicker "{n} items · {n} in the wash". Header has an "Add" primary button.
   - Horizontal filter chips: All, Bag, Sleepsuit, PJs, Base, Socks.
   - A 2-column grid with 2px gaps on the divider colour. Each card is a square greyscale photo (or the category label plus a large TOG number in neutral-500), the name (14px/800), and meta. Items in the wash show at 60% opacity with an ink "In the wash" tag.
6. **Item editor** (full-screen overlay):
   - Header with Cancel, the title and Save.
   - Fields: photo slot (120px square; tap to choose or take a photo), Name, Type (3-column grid of buttons; selected is filled accent), TOG with a per-type hint, Sleeves seg, Legs seg, Fabric and Size, Web link with "Open link ↗", Availability seg, Notes. Plus Delete.
7. **History ("What it's learned")**:
   - The offset at 44px in accent, labelled "TOG vs guide", with an insight sentence.
   - An SVG chart, 350×196: x-axis 14–26°C, y-axis 0–4 TOG. The guide line is a 1.5px ink line, the personal line is 2px accent dashed 5 4, and each rated night is a 10px square (cool: outlined, right: ink, warm: accent).
   - A table: Night · Overnight · TOG · Result tag, plus "Door open · Teething" meta. **Tapping a row opens the Night editor.**
8. **Night editor** (full-screen overlay): Bedtime (room, humidity, outside, radiator, door), Morning (room, humidity), Outfit worn (one dropdown per slot, with a live TOG total), Result (5-cell rating plus "Mark as not rated"), Health, Signs, Note, and Delete. Saving recomputes `overnight`, `tog` and `actual`.
9. **Settings** (bottom sheet):
   - Child's name and age in months.
   - Postcode and **Look up**, which fills lat/lon/city and refreshes the forecast.
   - Location, Lat, Lon.
   - "Refresh 7pm–7am forecast".
   - Morning reminder: On/Off, time, a status line, and "Send a test reminder".
   - Learn from morning feedback: On / "Off — use guide only".

**Notification**: the system push reads "How did {child} sleep?" with the body "Tap to rate last night and add the morning room reading." Tapping it deep-links to `/morning`. When the app is in the foreground, show the in-app banner instead: an ink card 8px from the edges with the text in the bg colour.

---

## Design tokens (from `styles.css`)
- **Colours:** bg `#f3f2f2`, surface `#eae9e9`, text `#201e1d`, accent `#ec3013`, divider = text at 40% (`color-mix`). Ramps: neutral-200 `#eae7e7`, 300 `#d7d3d3`, 500 `#9b9797`, 600 `#7d7979`, 700 `#605d5d`, 800 `#444141`, 900 `#2d2b2b`. Accent-100 `#fff2ef`, 600 `#dd2b0f` (hover), 700 `#ae1800` (small accent text and pressed states), 800 `#7c1405`.
- **Type:** Archivo 400/600/800. H1 is 34px for screens; H4 20, H6 13 uppercase with 0.08em spacing; body 13–15px; labels 11–12px.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32. Screen gutters are 20px.
- **Radius:** 0 everywhere.
- **Rules:** 2px divider between sections, 1px between rows.
- **Shadows:** `--shadow-md` on the toast, `--shadow-lg` on the notification banner.
- **Focus:** `:focus-visible` gets a 2px accent outline offset by 2px. Disabled controls are at 45% opacity.
- **Icons:** Lucide (moon, calendar, cloud, sun, shirt, line-chart, sliders-horizontal, plus, minus, arrow-left-right, check, camera, external-link, x).
- **Photos:** always shown through the `grayscale` filter: `grayscale(1) contrast(1.08)`.

## Files
- `Sleep Outfit.dc.html`: the full interactive prototype. The template is at the top; all the logic is in `<script data-dc-script>` at the bottom.
- `support.js`: the runtime that renders the prototype. It's only needed to view it.
- `styles.css`: the Modernist tokens and component classes (`.btn`, `.seg`, `.input`, `.field`, `.tag`, `.table`).
- `CLAUDE_CODE_PROMPT.md`: a ready-to-paste kickoff prompt.
