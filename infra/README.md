# Cairn — infra

Host-side configs for running Cairn on the wizardtools.ai server. Two
files, both reverse-proxied behind the existing host nginx.

## Files

- `cairn.wizardtools.ai.conf` — nginx site config; proxies
  `cairn.wizardtools.ai` to `127.0.0.1:13002`.
- `cairn.service` — systemd unit; runs the Next.js standalone server
  on port 13002 as user `soroush`, restarts on failure, loads env from
  `.env.local`.

## First-time install

DNS prereq: `cairn.wizardtools.ai` must resolve to this server's public
IP. Verify with `dig +short cairn.wizardtools.ai`.

```bash
# 1. Build the app
cd /home/soroush/cairn
pnpm install
pnpm build

# 2. Install the systemd unit
sudo cp infra/cairn.service /etc/systemd/system/cairn.service
sudo systemctl daemon-reload
sudo systemctl enable --now cairn.service
sudo systemctl status cairn.service

# 3. Install the nginx site
sudo cp infra/cairn.wizardtools.ai.conf /etc/nginx/sites-available/cairn.wizardtools.ai.conf
sudo ln -s /etc/nginx/sites-available/cairn.wizardtools.ai.conf \
           /etc/nginx/sites-enabled/cairn.wizardtools.ai.conf
sudo nginx -t && sudo systemctl reload nginx

# 4. Provision TLS (certbot edits the conf file in place to add SSL +
# the HTTP -> HTTPS redirect).
sudo certbot --nginx -d cairn.wizardtools.ai
```

After step 4, browse to <https://cairn.wizardtools.ai/>.

## Updating after code changes

```bash
cd /home/soroush/cairn
git pull
pnpm install
pnpm build
sudo systemctl restart cairn.service
journalctl -u cairn.service -n 50 --no-pager
```

## Notes

- Port `13002` is chosen to fit the existing wizardtools convention
  (`leado` is on 13000, etc.) and avoids the already-bound 3000/3001.
  If you need to change it, update both `cairn.service` (`PORT=`) and
  `cairn.wizardtools.ai.conf` (`upstream cairn_app`).
- `pnpm build` is wired to copy `public/` and `.next/static/` into
  `.next/standalone/` after the Next build, since Next's standalone
  output skips static assets by design. The systemd unit runs
  `node .next/standalone/server.js` directly, so the copy step is
  required.
- The synthesizer endpoint streams Server-Sent Events. The nginx site
  has buffering disabled and a 10-min read timeout under
  `location /api/docs/` so first-token latency stays low and long
  syntheses don't get cut off.
