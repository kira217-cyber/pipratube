# PipraTube Studio

The creator app — its own site, like YouTube Studio: **https://studio.pipratube.com**.
Same account as PipraTube; "Upload" / "Studio" links on pipratube.com sign the creator in here automatically (one-time hand-off code, see `server/README.md`).

Pages: Dashboard, Content, Upload (with the share screen), Edit video, Analytics, Earn, Customization, Verification, Account, Payout.

## Run

```bash
npm install
npm run dev        # http://localhost:5177 — needs the API on :5100
npm run build      # production build → dist/
```

`.env` (see `.env.example`): `VITE_API_URL` and `VITE_SITE_URL`. Leave them empty for a production build to use `https://api.pipratube.com` and `https://pipratube.com`.

## Domains

| App | Domain | Folder |
|---|---|---|
| Viewer site | https://pipratube.com | `client/` |
| Studio | https://studio.pipratube.com | `studio/` |
| Admin | https://admin.pipratube.com | `admin/` |
| API | https://api.pipratube.com | `server/` |
