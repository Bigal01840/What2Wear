#!/bin/sh
# Renew the Tailscale HTTPS certificate and reload the app.
# Tailscale certs last 90 days; run this monthly from root's crontab:
#   0 4 1 * * /home/pi/sleep-outfit/scripts/renew-cert.sh pi.your-tailnet.ts.net pi
set -eu
HOSTNAME="$1"            # e.g. pi.your-tailnet.ts.net
OWNER="${2:-pi}"         # the user that runs pm2
DIR="/home/$OWNER/certs"
mkdir -p "$DIR"
tailscale cert --cert-file "$DIR/$HOSTNAME.crt" --key-file "$DIR/$HOSTNAME.key" "$HOSTNAME"
chown "$OWNER" "$DIR/$HOSTNAME.crt" "$DIR/$HOSTNAME.key"
chmod 600 "$DIR/$HOSTNAME.key"
su - "$OWNER" -c "pm2 reload sleep-outfit" || true
