# ChamFlorals — quick run & Vercel deploy

This repo contains a small Express API (exported from `api/index.js`), static site files in `public/`, and admin front-end pages under `admin/`.

Local run
- Install deps:

```powershell
cd 'C:\Users\johnm\Desktop\ChamFlorals'
npm install
```

- Run locally:

```powershell
# start the server
npm start

# or for auto-reload while developing (nodemon is installed as a devDependency)
npm run dev
```

Vercel settings
- Install Command: `npm install` (or `npm ci` if you commit your lockfile)
- Build Command: (leave empty)
- Output Directory: `public`

Recommended `vercel.json` (already included)

Environment variables to add in Vercel Project settings (check `src/config/supabase.js` and `.env` for exact names used):
- SUPABASE_URL
- SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY (use service role only for server-side privileged ops)
- SUPABASE_SERVICE_ROLE_KEY (if used)
- SUPABASE_STORAGE_BUCKET (optional)
- ADMIN_EMAIL
- ADMIN_PASSWORD
 # Chammy Florals — Project README

This repository contains the Chammy Florals website and server API:

- Public static site and client scripts: `public/` (homepage, reviews page, admin UI assets)
- Serverless Express app (API): `api/index.js` (mounts routes from `src/routes/*`)
- Admin front-end: `public/admin/` (HTML + JS protected by an admin token scheme)

This README explains how to run, configure, deploy, and troubleshoot the project.

## Quick start (local development)

1. Install dependencies

```powershell
cd C:\Users\johnm\Desktop\ChamFlorals
npm install
```

2. Run the app

```powershell
# Run once
npm start

# Or run with auto-reload (recommended during development)
npm run dev
```

The local server listens on port 3000 by default (see `dev.js`). Visit `http://localhost:3000`.

## Architecture overview

- `api/index.js` — Express app exported for serverless hosting (Vercel). It mounts routes under `/api` and `/api/admin`.
- `src/routes/` — Express routers (public API, admin API). Key endpoints:
	- `GET /api/products`, `GET /api/categories` — public product endpoints
	- `GET /api/reviews`, `POST /api/reviews` — public reviews (server validates order & prevents duplicates)
	- `GET /api/admin/reviews`, `DELETE /api/admin/reviews/:id` — admin review management (protected)
	- `POST /api/admin/login`, `GET /api/admin/verify-token` — admin authentication
- `public/` — static frontend files served directly in production. Admin HTML lives in `public/admin/`.

The app uses Supabase for persistence; see `src/config/supabase.js` for configuration.

## Environment variables

Set these in your local `.env` (DO NOT commit) and in your Vercel project settings:

- SUPABASE_URL — your Supabase project URL
- SUPABASE_KEY — service role or anon key used by the server (use service role only on server)
- SUPABASE_STORAGE_BUCKET — optional storage bucket name
- ADMIN_EMAIL — admin username/email used for the built-in admin token
- ADMIN_PASSWORD — admin password used for the built-in admin token
- DISCORD_WEBHOOK_URL — optional webhook for notifications
- NODE_ENV — set to `production` in deployment

Note: The code expects environment variables referenced by `src/config/supabase.js` — confirm the exact names there before deploying.

## Reviews feature

- Public users can submit reviews via `/api/reviews`. Submissions require a valid `orderId` whose status is `Delivered`. Server enforces:
	- Order exists
	- Order status equals `Delivered`
	- One review per order (returns 409 on duplicates)
	- Stars clamped to 1–5, message sanitized server-side
- Admins can view and delete reviews under the admin UI (`/admin/reviews.html`) using `/api/admin/reviews` and `DELETE /api/admin/reviews/:id`.

## Security

- Admin auth: a simple token scheme (base64 of `ADMIN_EMAIL:ADMIN_PASSWORD`) is used for protected admin endpoints. Keep `ADMIN_PASSWORD` secret.
- Input sanitization: the server strips tags from review messages and clamps numeric fields. Client-side sanitization is applied for UX but should not be relied on for security.
- Helmet CSP: the app configures a Content-Security-Policy (see `api/index.js`). If you change external assets (fonts, CDNs), update CSP accordingly.

## Deployment — Vercel

Recommended Vercel configuration:

- Install Command: `npm install` (or `npm ci`)
- Build Command: (leave empty)
- Output Directory: `public`

Routing notes
- `api/index.js` exports an Express app and the project expects API requests under `/api/*` to be routed to that function. `vercel.json` in this repo contains the rewrite rules to ensure `/api/*` requests reach `api/index.js`.

Environment variables
- Add the environment variables listed above into your Vercel project (Production and Preview as appropriate).

Static files
- Files under `public/` are served as static assets. Ensure image and asset paths reference `public/` (e.g., `public/flowers/...`).

## Troubleshooting

- 404 on `/api/...`:
	- Ensure the dev server is running locally (npm start / npm run dev).
	- Verify `vercel.json` contains the API rewrite so `/api/*` reaches `api/index.js` on Vercel.

- CSP blocks (fonts, inline scripts):
	- The server configures Helmet CSP in `api/index.js`. If external assets are blocked, add their host to the appropriate CSP directive (e.g., `fonts.googleapis.com` to `style-src`) or self-host the asset.

- Supabase errors:
	- Confirm `SUPABASE_URL` and `SUPABASE_KEY` are correct and that the `reviews`, `orders`, and `products` tables exist with the expected columns.

## Testing & verification

- Local smoke test examples (PowerShell):

```powershell
# Get public products
curl http://localhost:3000/api/products

# Attempt admin verify-token (replace <token>)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/admin/verify-token
```

## Contributing

If you plan to change routing, CSP, or environment variable names, update this README and verify locally with `npm run dev` before pushing.

If you'd like help hardening CSP (nonces/hashes) or moving inline scripts to external files, I can prepare a focused patch and run a smoke test.

## License

This repository does not include a license file. Add a LICENSE file if you want to make the project open source.
