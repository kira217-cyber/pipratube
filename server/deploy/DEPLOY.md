# Deploying PipraTube to a VPS

Four apps, one server (Ubuntu 22.04/24.04 assumed):

| Domain | What | From repo |
|---|---|---|
| https://pipratube.com | Viewer site (static) | `pipra-tv` (client) |
| https://studio.pipratube.com | Creator Studio (static) | `pipra-tv-studio` |
| https://admin.pipratube.com | Admin panel (static) | `pipra-tv-admin` |
| https://api.pipratube.com | Node API (PM2) | `pipra-tv-server` |

The database is the hosted MongoDB (`pipratube`); videos are on Bunny (`PipraV2`); images live in the API's `uploads/` folder.

## 1. DNS

Point these **A records** at the VPS IP: `pipratube.com`, `www.pipratube.com`, `studio.pipratube.com`, `admin.pipratube.com`, `api.pipratube.com`.

## 2. Server software

```bash
sudo apt update && sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y certbot python3-certbot-nginx
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 3. Code

```bash
sudo mkdir -p /var/www/pipratube && sudo chown $USER /var/www/pipratube && cd /var/www/pipratube
git clone https://github.com/kira217-cyber/pipra-tv-server.git server
git clone https://github.com/kira217-cyber/pipra-tv.git client
git clone https://github.com/kira217-cyber/pipra-tv-studio.git studio
git clone https://github.com/kira217-cyber/pipra-tv-admin.git admin
```

## 4. API

**Manual upload (zip):** unzip `pipratube-server.zip` into `/var/www/pipratube/server` — it already holds the code, the `uploads/` images and `.env.production` — then:

```bash
cd /var/www/pipratube/server
npm ci --omit=dev
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup   # run the command it prints, so the API starts on boot
curl http://127.0.0.1:5100/api/health    # {"ok":true,"db":"up",…}
```

With `--env production` the API reads `.env.production` (or `.env` if that's missing).

**Or from git:**

```bash
cd /var/www/pipratube/server
npm ci --omit=dev
nano .env.production   # see below
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup   # run the command it prints, so the API starts on boot
```

`.env.production` — the zip has a ready one; from git, copy it over or write it with these:

```
PORT=5100
MONGO_URI=mongodb://USER:PASSWORD@HOST:27017/pipratube?authSource=admin
PUBLIC_URL=https://api.pipratube.com
JWT_SECRET=<64 random characters>
ADMIN_JWT_SECRET=<a different 64 random characters>
# Bunny keys exactly as in development (BUNNY_STORAGE_*, BUNNY_CDN_HOSTNAME, BUNNY_STORAGE_FOLDER=PipraV2)
```

In production the API refuses to start if a secret is weak or missing — `pm2 logs pipratube-api` says which.

**Images:** copy the development `server/uploads/` folder to `/var/www/pipratube/server/uploads/` (it is not in git):

```bash
# on the development PC, from Pipra-TV-NEW-VERSION/server
scp -r uploads USER@VPS_IP:/var/www/pipratube/server/
```

Check: `curl http://127.0.0.1:5100/api/health` → `{"ok":true,"db":"up",…}`

## 5. Web apps

Production builds already talk to `https://api.pipratube.com` and link to each other's domains — no `.env` needed (delete any development `.env` before building).

```bash
for app in client studio admin; do (cd /var/www/pipratube/$app && npm ci && npm run build); done
```

## 6. nginx + HTTPS

```bash
sudo cp /var/www/pipratube/server/deploy/nginx/pipratube.conf /etc/nginx/sites-available/pipratube.conf
sudo ln -s /etc/nginx/sites-available/pipratube.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pipratube.com -d www.pipratube.com -d studio.pipratube.com -d admin.pipratube.com -d api.pipratube.com
```

Certbot adds HTTPS and the http → https redirect, and renews itself.

## 7. Updating later

```bash
cd /var/www/pipratube/server && git pull && npm ci --omit=dev && pm2 reload pipratube-api
for app in client studio admin; do (cd /var/www/pipratube/$app && git pull && npm ci && npm run build); done
```

## Video uploads (any format, up to 50 GB)

- Uploads arrive in 8 MB pieces into `server/tmp/uploads/`, then are converted to MP4 (H.264/AAC) by the ffmpeg that comes with `npm ci` (no `apt install` needed) and saved to Bunny. The temp files are deleted afterwards.
- **Disk:** keep free space of at least **2× the biggest video** you expect (the upload + the converted copy) — e.g. 100 GB free for 50 GB uploads.
- **CPU:** converting takes roughly real time or faster on 2–4 cores. H.264 MP4/MOV/MKV files are only repackaged (seconds). Tune with `PROCESSING_CONCURRENCY` and `FFMPEG_PRESET` in `.env.production`.
- The limit is `MAX_UPLOAD_GB` (default 50).

## Backups

- Database: `mongodump --uri "<MONGO_URI>" --out /var/backups/pipratube-$(date +%F)`
- Images: `/var/www/pipratube/server/uploads/`
- Videos are on Bunny.

## Link previews (Facebook, WhatsApp, Messenger…)

Apps that show a preview of a shared link don't run the React app. The
nginx config sends their requests for pages of pipratube.com to the API's
`/api/og`, which answers with the video's thumbnail, title and description
(or the channel's, or the PipraTube logo for everything else). After
changing nginx: `sudo nginx -t && sudo systemctl reload nginx`.

Facebook keeps old previews for a while; paste a link into
https://developers.facebook.com/tools/debug/ and press "Scrape Again" to
refresh it.

## Video uploads through Bunny Stream

With `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY` and
`BUNNY_STREAM_CDN_HOSTNAME` set, Studio and Admin upload videos straight from
the browser to Bunny Stream (TUS, resumable) — no video bytes go through this
server. Bunny encodes them (HLS 240p–1080p + MP4 copies); the API publishes
each video when Bunny reports it finished. Without those variables uploads
fall back to the older path (pieces through this server, ffmpeg, Bunny Storage).

In the Bunny Stream library settings:

- Webhook URL: `https://api.pipratube.com/api/bunny/stream-webhook`
  (the API also checks unfinished videos every 20 seconds, so a missed
  webhook only delays publishing a little).
- Encoding: MP4 fallback on (used for previews, downloads and share previews).
- Security → allowed referrers: `pipratube.com`, `www.pipratube.com`,
  `studio.pipratube.com`, `admin.pipratube.com`.

