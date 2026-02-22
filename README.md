# Bot Dashboard

A Discord bot management dashboard. Pure frontend — connects directly to NeonDB from the browser using NeonDB's serverless WebSocket driver. No backend server required.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you'll see a setup screen asking for your NeonDB connection string. Paste it in and click **Connect**. It's saved to `localStorage` so you only need to do this once.

## Optional: bake the URL in at build time

Create a `.env` file (copy from `.env.example`):

```
VITE_DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

With this set, the setup screen is skipped automatically.

## Build for production

```bash
npm run build    # outputs to /dist
npm run preview  # preview the production build locally
```

Deploy the `/dist` folder to any static host (Vercel, Netlify, Cloudflare Pages, nginx, etc.).

## How it works

NeonDB's `@neondatabase/serverless` package runs directly in the browser via WebSockets — no backend proxy needed. Your connection string is never sent to any third-party server, only directly to NeonDB.

```
Browser → WebSocket → NeonDB
```
