# Hosting

Two options:

- **A. A Raspberry Pi or home machine, reached only over Tailscale.** Recommended. Nothing is exposed to the internet.
- **B. Fly.io with a persistent volume.** Use this if you'd rather not keep a machine running at home.

Either way the app is a single Node process. It serves the PWA and the API, stores everything in `data/sleep-outfit.db`, and keeps photos in `data/photos/`.

---

## A. Raspberry Pi or home machine + pm2 + Tailscale HTTPS

These steps assume a Pi 4/5 (or any Linux box) running Raspberry Pi OS / Debian 12 with a user called `pi`. Change `pi` to your username throughout if yours differs.

### 1. Install Node 22 and build tools

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential python3
node -v   # v22.x
```

`better-sqlite3` and `sharp` ship prebuilt ARM64 binaries, so the build tools are only a fallback.

### 2. Get the app and build it

```sh
cd ~
git clone https://github.com/bigal01840/What2Wear.git sleep-outfit   # private repo: `gh auth login` first, or use a deploy key
cd sleep-outfit
npm ci
npm run build
cp .env.example .env
```

### 3. Install Tailscale on the Pi and on both phones

On the Pi:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4          # note this 100.x.y.z address
```

On each phone, install the **Tailscale** app (App Store / Play Store) and sign in to the **same tailnet**. Leave the VPN switched on. It's light on battery, and the app only works while it's connected.

In the Tailscale admin console (<https://login.tailscale.com/admin/dns>):

1. Turn on **MagicDNS**.
2. Under **HTTPS Certificates**, click **Enable HTTPS**.

Your Pi now has a name like `pi.tail1234.ts.net`. Find it with `tailscale status` or on the Machines page.

### 4. Get a certificate with `tailscale cert`

```sh
sudo ./scripts/renew-cert.sh pi.tail1234.ts.net pi
```

This runs `tailscale cert`. It writes `~/certs/pi.tail1234.ts.net.crt` and `.key`, and makes them readable by `pi`. It also tries to reload pm2, which fails harmlessly the first time because pm2 isn't running yet.

### 5. Configure `.env`

```ini
HOUSEHOLD_PASSCODE=pick-something-long-you-both-know
DATA_DIR=./data
HOST=100.x.y.z                 # the Pi's Tailscale IP: nothing on your LAN/Wi-Fi can reach it
PORT=8443
TLS_CERT=/home/pi/certs/pi.tail1234.ts.net.crt
TLS_KEY=/home/pi/certs/pi.tail1234.ts.net.key
VAPID_SUBJECT=mailto:you@example.com
```

The app URL will be **`https://pi.tail1234.ts.net:8443`**.

> **Want it on port 443 (no `:8443`)?** Either allow Node to bind low ports with
> `sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which node)")"` and set `PORT=443`,
> or skip steps 4–5's TLS lines, keep `HOST=127.0.0.1 PORT=3000`, and run
> `sudo tailscale serve --bg --https=443 http://127.0.0.1:3000`. With `tailscale serve`, Tailscale terminates HTTPS and renews the certificate for you.

The VAPID keys for push are generated on first start into `data/vapid.json`. Keep that file: if you lose it, both phones need to turn reminders off and on again.

### 6. Run it under pm2

```sh
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # prints a sudo command; run it so the app starts on boot
pm2 logs sleep-outfit  # should say: listening on https://100.x.y.z:8443
```

To update later:

```sh
cd ~/sleep-outfit && git pull && npm ci && npm run build && pm2 reload sleep-outfit
```

### 7. Renew the certificate monthly

Tailscale certificates last 90 days. Add this to root's crontab (`sudo crontab -e`):

```cron
0 4 1 * * /home/pi/sleep-outfit/scripts/renew-cert.sh pi.tail1234.ts.net pi >> /var/log/sleep-outfit-cert.log 2>&1
```

### 8. Nightly backup

`scripts/backup.sh` uses SQLite's online backup API, so it's safe while the app is running. It writes `backups/sleep-outfit-YYYY-MM-DD.db`, copies new photos and `vapid.json`, and deletes database snapshots older than 30 days.

`crontab -e` (as `pi`):

```cron
15 3 * * * cd /home/pi/sleep-outfit && sh scripts/backup.sh >> backups/backup.log 2>&1
```

Set `BACKUP_DIR=/mnt/usb/sleep-outfit` in `.env` to put backups on another disk. Better still, sync `backups/` off the machine (another computer, or `rclone` to cloud storage).

**Restore:** `pm2 stop sleep-outfit`, copy a snapshot to `data/sleep-outfit.db`, delete `data/sleep-outfit.db-wal` and `-shm` if present, copy `backups/photos/*` into `data/photos/`, then `pm2 start sleep-outfit`.

### 9. Optional: restrict it to your two phones

Binding to the Tailscale IP already keeps it off your LAN. To stop other devices on your tailnet reaching it, add a rule in **Access controls** in the admin console that allows only your two phones (or your two users) to reach `pi:8443`.

### Why push still works

Reminders don't need inbound access. The Pi sends them *out* to Apple's and Google's push services, which deliver them to the phones. Tapping the notification opens the app, and that request goes over Tailscale.

---

## B. Fly.io with a persistent volume

The app is reachable on the public internet at `https://<app>.fly.dev`. It's protected only by the household passcode, so pick a long one. Everything else (cookie auth, same-origin checks, a login throttle of 10 attempts per 15 minutes) is identical.

```sh
# 1. Install flyctl and sign in
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Edit fly.toml: set `app` to a unique name (and primary_region if not London)
fly launch --copy-config --no-deploy

# 3. One volume, in the same region. SQLite needs exactly one machine.
fly volumes create sleep_outfit_data --region lhr --size 1

# 4. Secrets
fly secrets set HOUSEHOLD_PASSCODE='pick-something-long' VAPID_SUBJECT='mailto:you@example.com'

# 5. Deploy
fly deploy
fly scale count 1     # never more than one machine: they'd each have their own SQLite file
```

Notes:

- `fly.toml` keeps the machine running (`auto_stop_machines = "off"`), because the 7am reminder cron runs inside the app.
- Data lives on the volume at `/data`. VAPID keys are generated into `/data/vapid.json` on first boot. You can also set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as secrets.
- **Backups:** Fly takes daily volume snapshots automatically (`fly volumes snapshots list <vol-id>`). For a copy you control, pull one nightly from another machine:

  ```sh
  fly ssh console -C "node scripts/backup.mjs /data/backups"
  fly ssh sftp get /data/backups/sleep-outfit-$(date +%F).db ./sleep-outfit-$(date +%F).db
  ```

---

# Install on iPhone / Android

Do this on **both** phones. Tailscale must be connected first if you're using option A.

### iPhone (iOS 16.4 or later)

1. Open the app URL in **Safari**, not Chrome. Use `https://pi.tail1234.ts.net:8443` for option A or `https://<app>.fly.dev` for option B.
2. Enter the household passcode and tap **Sign in**.
3. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
4. Open **Sleep Outfit from the Home Screen icon**. iOS only allows notifications for Home Screen apps, and the Home Screen app has its own storage, so sign in once more if asked.
5. Tap the sliders button (top right of Tonight) to open **Settings**. Under **Morning reminder**, tap **Send a test reminder** and choose **Allow**.
6. You should get "How did Our toddler sleep?" within a few seconds. Tapping it opens the Morning check.

If you said "Don't Allow" by mistake, go to the iPhone's **Settings**, then **Notifications**, then **Sleep Outfit**, and turn on **Allow Notifications**.

### Android (Chrome)

1. Open the app URL in **Chrome** and sign in with the passcode.
2. Tap **⋮**, then **Add to Home screen** (or **Install app**), then **Install**.
3. Open it from the Home Screen icon. Under **Settings** and **Morning reminder**, tap **Send a test reminder** and allow notifications.

If you blocked it: long-press the app icon, then **App info**, then **Notifications**, then turn them on.

### Day to day

- At 07:00 UK time (or whatever you set), both phones get a reminder **only if last night hasn't been rated yet**. If one of you has already rated it, nobody is nagged.
- Both phones share the same wardrobe, nights and naps. A change on one shows on the other the next time the app is opened, or within a minute if it's already open.
- The app works offline. Changes made without a connection are saved on the phone and sent when it reconnects.
