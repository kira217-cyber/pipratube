# Pipra-TV — new admin panel

The admin panel for the new Pipra-TV. It talks to `../server` (`/api/admin/*`). The old `admin/` app and its database are not used.

## Run

```
npm install
cp .env.example .env   # VITE_API_URL = the new server, VITE_SITE_URL = the new client
npm run dev            # http://localhost:5176
```

Sign in with the main admin created by `npm run seed:admin` in `../server` (email and password come from that `.env`).

## What's here

| Page | What it does |
|---|---|
| Dashboard | Users, channels, videos, Shorts, views, likes, comments, subscriptions; new users and uploads over 14 days; most watched and latest uploads |
| Videos | Search and filter every upload. Edit details or thumbnail, take down (with a reason the creator sees), restore, or delete for good. Upload on behalf of any channel |
| Users | Search, block or unblock (blocking signs the user out everywhere) |
| Channels | Verify (✓ badge), suspend or restore. A suspended channel and its videos disappear from the site |
| Comments | Search and delete (replies go with it) |
| Home page | Pinned videos at the top of the feed, pinned Shorts, your own featured rows, "Channels to watch" |
| Ads | Home banners (top card or inside the feed) and in-player video ads, with optional start/end dates |
| Live TV | Add or edit channels (fill from the IPTV list), categories, row / pinned / Home flags. "Import from old site" copies the current site's channels once (that site is only read) |
| Site settings | Name, logo, favicon, contact email, announcement bar, social and footer links |
| Admins | Main admin only: create admins and choose what each one can manage |
| Account | Change your password |
