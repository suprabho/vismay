# aura-poster

A ~130-line screenshot service that turns an animated
[aura.promad.design](https://aura.promad.design) embed into a still JPEG
poster frame. The footshorts share-card composer needs that frame because the
aura renders as a cross-origin iframe, which the in-browser PNG capture
(html-to-image) can never rasterize — and running headless Chromium inside a
Vercel serverless function is fragile. So the browser lives here instead, in a
plain container on the official Playwright image, and the admin app just
fetches poster images.

```
GET /healthz                       → 200 ok            (no auth)
GET /poster/<slug>?width=&height=  → image/jpeg        (Authorization: Bearer $AURA_POSTER_TOKEN)
```

Consumed by `apps/admin` → `POST /api/footshorts/share/aura-poster`, which
proxies here (keeping the token server-side) and hands the composer a data
URL. Without `AURA_POSTER_SERVICE_URL` configured, local admin dev falls back
to launching Playwright's own Chromium directly — this service is only
*required* for the deployed admin.

## Deploy (any container host)

The directory is self-contained — no workspace deps — so point any Docker
host at it. Fly.io example:

```sh
cd apps/aura-poster
fly launch --no-deploy          # accept defaults; internal port 8080
fly secrets set AURA_POSTER_TOKEN=$(openssl rand -hex 24)
fly deploy
```

Railway / Render: create a service from this subdirectory with the Dockerfile
build, set `AURA_POSTER_TOKEN`, done. ~256 MB memory is plenty; scale-to-zero
is fine (a cold capture just takes a few seconds longer).

Then set on the **admin** Vercel project (all environments that should ship
aura cards, previews included):

```
AURA_POSTER_SERVICE_URL=https://<your-service-host>
AURA_POSTER_SERVICE_TOKEN=<same token>
```

## Env

| Var | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | |
| `AURA_POSTER_TOKEN` | unset | When set, `/poster` requires the Bearer token. Always set it in deploys — unset means open. |
| `AURA_EMBED_ORIGIN` | `https://aura.promad.design` | Override for testing against a staging aura host. |

## Local run

```sh
cd apps/aura-poster
npm install
npx playwright install chromium   # once, outside the Docker image
node server.mjs
curl -o poster.jpg 'localhost:8080/poster/<slug>?width=1080&height=1350'
```
