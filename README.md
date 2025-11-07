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
- DISCORD_WEBHOOK_URL (optional)
- NODE_ENV=production

Notes
- The Express app in `api/index.js` exports the app so Vercel will create serverless functions from files under `api/`.
- Static assets under `public/` will be served by Vercel when `Output Directory` is set to `public`.
- If you need a specific Node version, `package.json` contains an `engines` entry (Node 22.x).

Security
- Never commit your `.env` file. Store secrets in Vercel's Environment Variables interface.

Troubleshooting
- If you get errors about missing buckets, check your Supabase keys and permissions.
- For local dev, use `npm run dev` (nodemon) so code reloads on changes.
 
Fixing the 404s / 401s on Vercel
------------------
- If you see 404s for `/api/products` in Vercel logs, it's likely because Vercel tried to route `/api/products` to a file named `api/products` that does not exist. The repository has a single Express app in `api/index.js` that mounts internal routes (it expects the function to receive requests for all `/api/*` paths).

	To fix this I updated `vercel.json` so all requests under `/api/*` are routed to the single function at `/api/index.js`.

- If static images (e.g. `/flowers/cherry-blossom.png`) show 404s, make sure those image files are inside the `public/` directory (for example `public/flowers/cherry-blossom.png`). Vercel will only serve static files that are part of the build output (our `vercel.json` is configured to serve `public/**`). If your `flowers/` folder is at the repository root, move it into `public/flowers/` or add a static build step.

- 401 responses for image requests may happen if a protected route or middleware is handling those paths. Confirm the image paths are not processed by any auth middleware (e.g., under `/admin`) and are directly available in `public/`.

Redeploy & verify
------------------

After the changes above are deployed to Vercel (they set the app to trust the proxy and add a rewrite for `/admin/*`):

1. Push your branch and trigger a Vercel deploy (or use the Vercel dashboard to re-deploy the branch).

2. Confirm the forwarded-header error is gone by making a request that includes an X-Forwarded-For header and watching the Vercel function logs:

```powershell
curl -v -H "X-Forwarded-For: 1.2.3.4" https://<your-deployment-domain>/api/products
```

3. Confirm `/admin/login` serves the admin HTML. Example:

```powershell
curl -I https://<your-deployment-domain>/admin/login
```

4. If preview deployments still show 401/404 for images, check that the preview's environment variables include the correct Supabase keys and that the storage bucket/object is public or uses signed URLs.

If you want, I can also move `admin/` into `public/admin/` so Vercel serves it as a static asset without a rewrite; tell me which you prefer and I'll create the patch.
If you'd like, I can:
- Move the existing `flowers/` folder into `public/flowers` and update any client paths.
- Or add a separate static build rule to `vercel.json` to include the top-level `flowers/` folder (less common).
