# Pipra-TV — new client

The new version of the Pipra-TV website. It's one responsive React app for desktop and mobile browsers, built from the mobile designs in `../../site-structure/`. Viewers and creators use the same app:

- **Viewer pages:** Home, Live TV (with categories and a watch page), Videos, Watch, Shorts, Channel, Channels, Search.
- **Creator pages** moved to the separate Studio app (`../studio`, studio.pipratube.com). Links here open it already signed in.

It talks to the same `server/` API as the old site. The old `client/` and `studio/` apps are left untouched.

## Run

```
npm install
cp .env.example .env   # point VITE_API_URL at your server
npm run dev            # http://localhost:5175
npm run build
```

## Where the data comes from

The client talks to the new server in `../server` (`VITE_API_URL`, http://localhost:5100 in development).

| Feature | Source |
|---|---|
| Sign up / sign in (email or phone + password), account | New API: `/api/auth/*` |
| Create and customize a channel (one per account) | New API: `/api/channels/*` |
| Upload, edit, delete videos; content list; dashboard numbers | New API: `/api/studio/*` |
| Home feed, Videos, Watch, Shorts (2 min or shorter), Channel pages, Search | New API: `/api/videos`, `/api/channels` |
| Live TV, ads, Home curation, logo, footer | New API: `/api/site/*`, managed in the admin panel (`../admin`) |
| Likes, comments, subscriptions, notifications, history, playlists | New API |
| Earning, daily analytics curves, audience, traffic | Preview data (`src/utils/demo.js`) |

During `npm run dev`, Vite forwards `/api` to the new server.
