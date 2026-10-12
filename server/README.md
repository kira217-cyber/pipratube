# Pipra-TV — new server (v2)

**Deploying:** see [deploy/DEPLOY.md](deploy/DEPLOY.md) (VPS, PM2, nginx for all four pipratube.com domains, HTTPS).

The API for the new Pipra-TV: its own MongoDB database (`pipratube` on the hosted server; `pipratv_v2` in early development), its own users, channels, videos and admins. The old `server/` and its database are never touched.

## Run locally

```
npm install
cp .env.example .env        # fill in the values
npm run seed:admin          # creates the first super admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # http://localhost:5100
```

MongoDB in development runs straight from the installed binary, with the data kept in `.mongo-data/` (git-ignored):

```
"C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe" --dbpath .mongo-data --bind_ip 127.0.0.1
```

## What's in place

| Area | Endpoints |
|---|---|
| Accounts | `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH /api/auth/me`, `POST /api/auth/password` |
| Channels (one per user) | `POST /api/channels`, `GET/PATCH /api/channels/me`, `GET /api/channels/handle-available`, `GET /api/channels`, `GET /api/channels/:id-or-@handle` |
| Creator videos | `POST /api/studio/videos` (streams to Bunny), `GET/PATCH/DELETE /api/studio/videos/:id`, `GET /api/studio/videos`, `GET /api/studio/stats`, `GET /api/studio/upload-progress/:id` |
| Watching | `GET /api/videos` (`sort=latest\|popular\|trending\|random`, `type=shorts\|videos`, `category`, `channel`, `search`), `GET /api/videos/:id`, `POST /api/videos/:id/view`, `POST /api/videos/:id/share` |
| Likes | `POST /api/videos/:id/reaction` (`like`/`dislike`/`none`), `GET /api/me/liked` |
| Comments | `GET/POST /api/videos/:id/comments`, `GET /api/comments/:id/replies`, `PATCH/DELETE /api/comments/:id`, `POST /api/comments/:id/like\|pin\|heart` |
| Subscriptions | `POST/PATCH/DELETE /api/channels/:id/subscribe` (bell: `notify=all\|none`), `GET /api/me/subscriptions`, `GET /api/feed/subscriptions` |
| Notifications | `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all` |
| History & playlists | `GET/DELETE /api/me/history`, `GET /api/me/playlists`, `POST /api/playlists`, `POST /api/playlists/:id\|watch-later/videos`, `GET/PATCH/DELETE /api/playlists/:id`, `GET /api/channels/:id/playlists` |
| Site (public) | `GET /api/site/settings` (logo, ads, Home curation, channels, Live TV on Home), `GET /api/site/live-tv`, `GET /api/site/live-tv/:id`, `GET /api/site/ad-campaigns` |
| Admin | `POST /api/admin/login`, `GET /api/admin/me`, `POST /api/admin/me/password`, `/api/admin/admins` (main admin only) |
| Admin content | `GET /api/admin/dashboard`, `/api/admin/videos` (+ upload for any channel), `/api/admin/users`, `/api/admin/channels`, `/api/admin/comments` |
| Admin site | `/api/admin/site/home`, `/api/admin/site/ads`, `/api/admin/site/live-tv` (+ `/source`, `/import`), `/api/admin/site/settings` |

Rules:

- Uploads publish immediately. `visibility` can be public, unlisted or private, and a future `publishAt` schedules the video.
- Every video of 2 minutes or less (`SHORT_MAX_SECONDS`), portrait or landscape, is a Short. Shorts also appear in the normal feeds.
- **Videos** go to Bunny Storage under `BUNNY_STORAGE_FOLDER` (`PipraV2`). `VIDEO_PROVIDER=stream` is reserved for Bunny Stream once a library is created.
- **Images** (thumbnails, avatars, banners, logos, ad banners) are saved on this server in `uploads/images/` and served at `/uploads/…`. The database stores the path; `PUBLIC_URL` (production: `https://api.pipratube.com`) is put in front when it's read, so changing the domain needs no data changes. Back up `uploads/` together with the database. `npm run images:local` moved the images that were on Bunny before this change.
- `node scripts/copyDatabase.js <sourceUri> <targetUri>` copies a whole database (used to move development data into the hosted `pipratube` DB); it refuses to write into a database that already has data.
- `npm run videos:copy -- --max-gb=3` copies videos imported from the old site into `PipraV2` (smallest first; old files are only read). `--hide-rest` hides every video not in `PipraV2` yet (admin shows "Waiting to be copied to PipraV2"); copying one later shows it again. Run `npm run videos:copy` with no limit to copy everything.
- `POST /api/auth/handoff` + `POST /api/auth/handoff/redeem`: one-time (60 s) codes that carry a sign-in between pipratube.com and studio.pipratube.com.

Every admin route checks the admin's permissions (`dashboard`, `videos`, `users`, `channels`, `comments`, `home`, `ads`, `live-tv`, `settings`). The main admin has all of them.

Still to come: Pipra-TV's own scheduled channel (timetable-based, like the old O-TV).
