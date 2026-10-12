# PipraTube

A video platform for Bangla dramas, movies, Shorts and 24/7 Live TV.

| Folder | What it is | Site |
| --- | --- | --- |
| `client/` | The viewer site — Home, watch page, Shorts, channels, search, Live TV | pipratube.com |
| `studio/` | Creator studio — upload videos, manage content, analytics, earnings | studio.pipratube.com |
| `admin/` | Admin panel — videos, users, channels, ads, Live TV, site settings | admin.pipratube.com |
| `server/` | The API (Node.js, Express, MongoDB) used by all three | api.pipratube.com |

**Stack:** React 19, Vite, Tailwind CSS · Node.js, Express 5, MongoDB (Mongoose) · Bunny Stream (video upload, encoding and playback), Bunny Storage · ffmpeg · socket.io.

## Running it locally

Each folder is its own app with its own `package.json`.

```bash
# API
cd server
cp .env.example .env      # fill in MongoDB, JWT secrets, Bunny keys
npm install
npm run dev               # http://localhost:5100

# Viewer site, studio, admin (in separate terminals)
cd client && npm install && npm run dev   # http://localhost:5173
cd studio && npm install && npm run dev   # http://localhost:5174
cd admin  && npm install && npm run dev   # http://localhost:5175
```

The front-ends talk to the API set in `VITE_API_URL` (see each `.env.example`).

## Deploying

See [`server/deploy/DEPLOY.md`](server/deploy/DEPLOY.md) for the VPS setup (PM2, nginx for all four domains, HTTPS) and the Bunny Stream settings.

Never commit `.env` files — only `.env.example` with placeholder values.
