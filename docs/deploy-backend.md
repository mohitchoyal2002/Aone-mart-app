# Aone Mart backend deployment

The backend runs on Node 24. Vercel uses the permanent Turso database;
local development and Docker deployments can use SQLite with a persistent disk. Its public HTTPS URL is entered on the
Android app's first connection screen; use the origin without `/api` at the end.
Admin and customer endpoints retain their own password and role checks.

## Vercel + Turso

Project `aone-mart-app` is linked to this repository; root directory `apps/api`,
Express framework, Node 24, Mumbai function region. The owner approved the free
Turso integration and created `aone-mart-db` in Mumbai. Production is live at **https://api.aoneonlinemart.shop**;
**https://aone-mart-app.vercel.app** remains available. Enter either origin
in the Android app, without `/api`. Anonymous HTTPS health returned 200 and the
Turso database was verified through live admin login, inventory/dashboard reads,
Gemini chat (200) and logout revocation (401). 29 backend integration tests pass.
Actual inventory: 45 products, 1,315 units, 10 categories, 45 source records.
One-time administrator and CSV setup values have been cleared from project
configuration; subsequent builds retain the existing administrator and stock.

- Build command: `npm run prepare:vercel`.
- Permanent storage credentials: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- Runtime secrets: `JWT_SECRET`, `GEMINI_API_KEY`. Configure these privately in
  the production environment. `ENABLE_NOTIFICATIONS=false`, `TRUST_PROXY=1`.
- One-time setup: private `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ADMIN_NAME`; optional
  `INITIAL_INVENTORY_CSV_BASE64` for the owner's actual CSV. Clear these four
  setup values after the successful authenticated import and verification.
- The preparation script runs additive schema migration, checks remote rollback,
  foreign keys and concurrent stock reservation, and creates the first admin.
  It imports the initial CSV through the same authenticated preview/commit API,
  verifies prices, stock and preserved source records, then logs out its session.
  Existing import checksums prevent a redeployment resetting current stock.
- Production requests require the migrated permanent database. An ephemeral
  SQLite fallback is rejected on Vercel. Shared rate counters are in the database.
- The Vercel entry point is `app.mjs`; it uses the compiled Express app without opening an
  HTTP listener or starting background workers. The Android app polls orders;
  notifications remain deferred. Standalone Docker uses `src/index.ts` and can
  retain its authenticated WebSocket endpoint.
- Vercel uploads accept up to 4 MB, leaving space for multipart headers within
  the function body limit. Local/Docker uploads retain their 5 MB limit.
- `api.aoneonlinemart.shop` is assigned to this Vercel project. Its HTTPS health
  endpoint returned 200 on 5 October 2026 after deployment of commit `9ebf06e`.
  The Vercel production deployment reports the custom domain assigned with no
  alias error. Existing `app`/`admin` DNS cleanup is separate from this release.
  The root domain and `www` are outside the requested DNS changes.

## Render

`render.yaml` defines the complete service: Docker build, `/health` check,
Singapore region, one instance, persistent disk and notifications disabled.
It is a deployment configuration, not an already deployed server. Render's
persistent disk requires paid compute; confirm the current bill in your account.

1. Put this project in your own Git repository, connect that repository to
   Render, then create a Blueprint using `render.yaml`.
2. In the private environment fields, set `ADMIN_PHONE` to the mart owner's
   Indian phone number, `ADMIN_PASSWORD` to a unique password of at least 12
   characters, and `GEMINI_API_KEY` to your Gemini key. Render generates
   `JWT_SECRET`. Secrets do not belong in the repository or APK.
3. Deploy. The startup script creates the admin before serving requests and
   retains existing credentials on restarts. The catalog starts empty. Import
   the mart's actual products in Admin → Inventory after logging in.
4. Check `https://YOUR-SERVICE.onrender.com/health`. It must return
   `{"ok":true,"service":"aone-mart-api","version":"1.1.0"}`.
5. Enter `https://YOUR-SERVICE.onrender.com` on the Android connection screen.
   Sign up a customer and check an order through placed → accepted → packed →
   picked. Reject/cancel another order and check that its reserved stock returns.

Do not run `bootstrap.js` during the Docker build or Render pre-deploy command:
the persistent disk is mounted only when the service starts. Keep notifications
disabled until the later Firebase/Expo configuration is completed.

## Existing VPS

`deploy/vps/compose.yaml` includes the API, a persistent database volume and
Caddy HTTPS/WebSocket proxy. On a server where ports 80 and 443 are available,
point the backend domain's DNS to the server, prepare the private
`apps/api/.env`, copy `deploy/vps/.env.example` to `deploy/vps/.env`, and set
`API_DOMAIN` to the actual hostname. Run from the repository root:

```sh
docker compose --env-file deploy/vps/.env -f deploy/vps/compose.yaml up -d --build
docker compose --env-file deploy/vps/.env -f deploy/vps/compose.yaml ps
```

If the VPS already has Nginx/Caddy serving other applications, use that existing
proxy rather than starting this proxy on the same ports. Inspect the server
first. The plain Docker command below binds the API only to localhost.

Build using the repository root as context:

```sh
docker build -f apps/api/Dockerfile -t aone-mart-api .
docker volume create aone-mart-data
docker run -d --name aone-mart-api --restart unless-stopped \
  --env-file apps/api/.env \
  -e NODE_ENV=production -e DATABASE_PATH=/data/aone.sqlite \
  -e ENABLE_NOTIFICATIONS=false \
  -p 127.0.0.1:4000:4000 -v aone-mart-data:/data aone-mart-api
```

Configure Caddy or Nginx for HTTPS and WebSocket upgrades on `/realtime`.
Set `TRUST_PROXY=1` behind exactly one trusted reverse proxy. Maintain SQLite
backups and check a restore. No sample inventory is loaded automatically.

Reference: [Render Blueprint fields](https://render.com/docs/blueprint-spec),
[persistent disks](https://render.com/docs/disks) and
[Docker services](https://render.com/docs/docker).
