# GCP Cloud Run Jobs migration plan

Migration of the four render workflows (`render-pdf`, `render-video`, `render-audio`, `render-share`) from GitHub Actions `workflow_dispatch` to GCP Cloud Run Jobs.

## TL;DR

Move four GHA `workflow_dispatch` render workflows to Cloud Run Jobs, dispatched from Vercel via the Cloud Run Admin API.

- **One container image** (`render-runner`) built from the monorepo root, based on `mcr.microsoft.com/playwright:v1.59.1-noble`. An entrypoint shell script dispatches to one of the four `scripts/generate-*.ts` based on `JOB_TYPE`.
- **Four Cloud Run Jobs**, one per render type, configured with per-job CPU/memory and timeout. Each mounts the same six secrets from Secret Manager.
- **Two service accounts:** `render-runner-sa` (runtime, reads Supabase/Mapbox/Gemini secrets) and `render-trigger-sa` (Vercel-side, holds `run.jobs.run` on the four jobs only).
- **Vercel dispatch code** swaps from a GitHub REST POST to `google-auth-library` + Cloud Run Admin REST API. Handler signatures unchanged, so [packages/content-source/src/handlers/storyPdf.ts:14](packages/content-source/src/handlers/storyPdf.ts:14) and friends keep working as-is.
- **Feature-flagged rollout** via `RENDER_BACKEND_<KIND>=gha|gcp` env var per pipeline. Migrate PDF first (smallest blast radius), then share, audio, video.
- **CI for image builds:** keep one tiny GHA workflow that builds + pushes to Artifact Registry on push to `main`. Tag with both commit SHA and `latest`. The job pins to `RENDER_IMAGE_TAG` env var which Vercel sets, so prod can stay on a known-good SHA while we test new ones.
- **Cost:** roughly equivalent or slightly cheaper than current GHA-hosted runners for the volume we have, with much faster cold start than the GHA queue.

The biggest unknowns are (a) whether Cloud Run Jobs' cold-start fits inside the user's 3 s polling window without changing UX (almost certainly yes — we just need the first poll to keep returning `202 rendering`), and (b) whether 2 vCPU / 4 GiB is enough headroom for the Mapbox + ECharts page at full PDF resolution. Both validated empirically during the PDF rollout.

---

## 1. GCP setup

Create everything in a fresh GCP project so isolation is clean. All commands assume `gcloud` is authenticated and the project + region are set in env vars.

```bash
# 1. Project + region
gcloud projects create vismay-render --name="Vismay render"
gcloud config set project vismay-render
gcloud config set run/region us-central1   # match Vercel's default region

# 2. Enable APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com

# 3. Artifact Registry repo for container images
gcloud artifacts repositories create render \
  --repository-format=docker \
  --location=us-central1 \
  --description="Render runner images"

# 4. Service accounts
#    a) runtime SA — what the job runs as. Needs Secret Manager read.
gcloud iam service-accounts create render-runner \
  --display-name="Render runner runtime"

#    b) trigger SA — what Vercel uses to call `run.jobs.run`. Nothing else.
gcloud iam service-accounts create render-trigger \
  --display-name="Vercel-side dispatcher"

# 5. Grant runtime SA permission to read its secrets (added per-secret below)
#    Granting on the SA itself rather than secret-by-secret is also fine for now;
#    tighten later if we add unrelated secrets.

# 6. Service account key for `render-trigger` — paste into Vercel as
#    GCP_RUN_DISPATCH_SA_KEY. Keep the JSON in a password manager too.
gcloud iam service-accounts keys create render-trigger-key.json \
  --iam-account=render-trigger@vismay-render.iam.gserviceaccount.com
```

**IAM bindings (run after the four jobs exist):**

```bash
# Trigger SA gets `run.jobs.run` on each job individually
for JOB in render-pdf render-video render-audio render-share; do
  gcloud run jobs add-iam-policy-binding $JOB \
    --member="serviceAccount:render-trigger@vismay-render.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --region=us-central1
done
```

> `roles/run.invoker` is the role that grants `run.jobs.run`. Bound at the job level (not the project), so the trigger SA can't accidentally invoke anything else later.

Secret Manager entries (one-time, paste current Vercel/GHA values):

```bash
for KEY in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_MAPBOX_TOKEN \
           ADMIN_PASSWORD ADMIN_SESSION_SECRET GEMINI_API_KEY; do
  printf '%s' "$VALUE_FROM_VERCEL" | gcloud secrets create $KEY --data-file=-
  gcloud secrets add-iam-policy-binding $KEY \
    --member="serviceAccount:render-runner@vismay-render.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

Jobs themselves are created in §4 below (after the image exists). Order: APIs → Artifact Registry → SAs → Secret Manager entries → image push → job create → IAM binding on jobs.

---

## 2. Container strategy

**Recommendation: one image, entrypoint script picks the script.**

Why:
- Shared base layer (Playwright Chromium, Node, pnpm install) is by far the largest layer. Splitting into four images means 4x the Artifact Registry storage and 4x the build time.
- Each render script is just a `tsx scripts/generate-*.ts` call — the runtime is the same Node+Chromium for three of them; audio needs the same Node but skips Chromium, which is wasted but cheap. The `ffmpeg` requirement for video is the only extra system dep; install it in the base image (it's ~70 MB).
- Per-job config (CPU, memory, timeout) is what actually differentiates the pipelines, and that lives on the Cloud Run Job, not the image.

Base image: `mcr.microsoft.com/playwright:v1.59.1-noble` — matches the `"playwright": "^1.59.1"` in [apps/vizmaya-fyi/package.json:76](apps/vizmaya-fyi/package.json:76). Pin the exact version. The Playwright team ships Chromium + all system libs (libnss3, libatk, fonts) pre-installed, which is exactly what `--with-deps` was doing on GHA. We don't have to maintain that ourselves.

Build context: **monorepo root**, because `packages/content-source` and `packages/admin-core` (used by `generate-share.ts` via `signOutputUrl`) are pnpm workspace deps. A `.dockerignore` at the repo root excludes `node_modules`, `.next`, `apps/*/public/*` (large), and other apps that don't matter (`apps/footshorts`, `apps/vizf1`, `apps/catalog`, `verticals/*`).

The image needs:
- `apps/vizmaya-fyi/` (scripts + `lib/*Render.ts` files)
- `packages/content-source/` (workspace dep)
- `packages/admin-core/` (signOutputUrl, used by share + pdf renderers)
- `packages/ai-gateway/` (referenced by `apps/vizmaya-fyi/CLAUDE.md`)
- root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`

`apps/admin/` is NOT needed at runtime — the renders happen against the live `BASE_URL`, not a locally-served admin app. Confirm during PDF rollout by inspecting `apps/vizmaya-fyi/lib/storyPdfRender.ts` for any admin import; from current evidence (handler at [packages/content-source/src/handlers/storyPdf.ts:115](packages/content-source/src/handlers/storyPdf.ts:115)) it only needs Supabase + Playwright + the deployed site URL.

---

## 3. Dockerfile sketch

Place at repo root: `infra/render-runner/Dockerfile`. Build context is the repo root.

```dockerfile
# syntax=docker/dockerfile:1.7
# Base: Playwright's official image, locked to the same version as
# apps/vizmaya-fyi/package.json:76 ("playwright": "^1.59.1"). Update
# both in lockstep when bumping Playwright.
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    # Disable Playwright's auto-download — the base image already has
    # the matching browser binaries.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ffmpeg for the video render. ~70 MB but only one layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Activate pnpm via corepack. Pin to the same version as the root
# package.json's "packageManager" field (10.11.1 today).
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

WORKDIR /app

# ─── deps layer ──────────────────────────────────────────────────────
# Copy only the manifests first so node_modules is cached unless a
# package.json or the lockfile changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/vizmaya-fyi/package.json apps/vizmaya-fyi/
COPY packages/content-source/package.json packages/content-source/
COPY packages/admin-core/package.json packages/admin-core/
COPY packages/ai-gateway/package.json packages/ai-gateway/
COPY packages/viz-engine/package.json packages/viz-engine/

# `--frozen-lockfile` matches the GHA install. Filter to just the
# workspaces we need at runtime; saves ~30 % on install time.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter vizmaya-fyi... \
      --filter @vismay/content-source...

# ─── runtime layer ───────────────────────────────────────────────────
FROM deps AS runtime
# Copy source AFTER deps so source changes don't bust the deps cache.
COPY apps/vizmaya-fyi apps/vizmaya-fyi
COPY packages/content-source packages/content-source
COPY packages/admin-core packages/admin-core
COPY packages/ai-gateway packages/ai-gateway
COPY packages/viz-engine packages/viz-engine
COPY turbo.json ./

# The shared packages are TS-source-exported (see
# packages/content-source/package.json's "main": "src/index.ts"), so we
# don't need a separate `pnpm run build` step. tsx handles the
# compilation at runtime.

WORKDIR /app/apps/vizmaya-fyi

# Entrypoint dispatches on JOB_TYPE. Each Cloud Run Job sets a different
# JOB_TYPE plus the script-specific inputs in env vars.
COPY infra/render-runner/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

`infra/render-runner/entrypoint.sh`:

```bash
#!/usr/bin/env bash
# Entrypoint for the render-runner image. Cloud Run Job env vars:
#
#   JOB_TYPE   pdf | video | audio | share  (required)
#   SLUG       story slug (for pdf, video, audio)
#   FORMAT     report | slides              (pdf only)
#   ASPECT     9:16 | 16:9                  (video only)
#   START_MS   integer ms                   (video only, optional)
#   END_MS     integer ms                   (video only, optional)
#   MODE       demo | post                  (share only)
#   DEMO_ID                                 (share, mode=demo)
#   POST_ID                                 (share, mode=post)
#   BASE_URL   site URL to render against   (required for pdf/video/share)
#
# CONTENT_SOURCE / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
# NEXT_PUBLIC_MAPBOX_TOKEN / ADMIN_PASSWORD / ADMIN_SESSION_SECRET /
# GEMINI_API_KEY come from Secret Manager mounts on the job spec.
set -euo pipefail

case "${JOB_TYPE:?missing JOB_TYPE}" in
  pdf)
    exec pnpm exec tsx scripts/generate-pdf.ts "$SLUG" "$FORMAT" --force
    ;;
  video)
    extra=()
    [[ -n "${START_MS:-}" ]] && extra+=(--start-ms "$START_MS")
    [[ -n "${END_MS:-}"   ]] && extra+=(--end-ms   "$END_MS")
    exec pnpm exec tsx scripts/generate-video.ts "$SLUG" "$ASPECT" --force "${extra[@]}"
    ;;
  audio)
    exec pnpm exec tsx scripts/generate-audio.ts "$SLUG" --force
    ;;
  share)
    exec pnpm exec tsx scripts/generate-share.ts "$MODE" "${DEMO_ID:-${POST_ID}}"
    ;;
  *)
    echo "Unknown JOB_TYPE: $JOB_TYPE" >&2
    exit 2
    ;;
esac
```

Image size estimate: base ~1.4 GB (Playwright's image is hefty), + pnpm install ~600 MB = ~2 GB. Cold pull on Cloud Run takes 15-30 s for an image this size; first invoke after a few minutes idle adds ~25 s to render time. Subsequent invokes reuse the instance.

`.dockerignore` at repo root needs at least:

```
.git
.github
.next
**/node_modules
**/.turbo
apps/admin
apps/catalog
apps/footshorts
apps/vizf1
verticals
brand
docs
*.pdf
*.pptx
*.excalidraw
vizmaya-data
```

---

## 4. Build/push pipeline

**Recommendation: keep a single tiny GHA workflow at `.github/workflows/build-render-image.yml`.** It triggers on push to `main` when paths under `infra/render-runner/**`, `apps/vizmaya-fyi/scripts/**`, `apps/vizmaya-fyi/lib/storyPdfRender.ts` (and siblings), `packages/content-source/**`, `packages/admin-core/**`, or `pnpm-lock.yaml` change. Tags both `latest` and the commit SHA.

Why not Cloud Build:
- The team already operates GHA fluently; adding Cloud Build is a second CI system to monitor.
- GHA's `google-github-actions/auth@v2` + workload identity federation (no SA JSON key) is well-documented and lets us avoid putting a key in a GHA secret.
- The build itself is the same `docker build` either way.

Why not manual `gcloud builds submit`:
- Image gets stale silently if someone forgets after a `packages/content-source` change. The cache-key is wide enough (`packages/content-source/**`) that "did anyone change render code?" is hard to answer manually.

Sketch:

```yaml
name: Build render-runner image

on:
  push:
    branches: [main]
    paths:
      - 'infra/render-runner/**'
      - 'apps/vizmaya-fyi/scripts/**'
      - 'apps/vizmaya-fyi/lib/storyPdfRender.ts'
      - 'apps/vizmaya-fyi/lib/storyVideoRender.ts'
      - 'apps/vizmaya-fyi/lib/storyShareRender.ts'
      - 'packages/content-source/**'
      - 'packages/admin-core/**'
      - 'packages/ai-gateway/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/build-render-image.yml'

permissions:
  contents: read
  id-token: write   # workload identity federation

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/${{ secrets.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/github
          service_account: gha-image-pusher@vismay-render.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: infra/render-runner/Dockerfile
          push: true
          tags: |
            us-central1-docker.pkg.dev/vismay-render/render/render-runner:latest
            us-central1-docker.pkg.dev/vismay-render/render/render-runner:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Tag strategy: `latest` for "what the four jobs run by default", `<sha>` for pinning during rollback or testing. Cloud Run Jobs spec stores the *resolved* tag at deploy time, so updating `latest` doesn't auto-roll. After a successful build, optionally re-deploy the jobs to pick up the new tag — a follow-up step in this same workflow:

```yaml
      - name: Roll jobs to new image
        run: |
          IMG=us-central1-docker.pkg.dev/vismay-render/render/render-runner:${{ github.sha }}
          for JOB in render-pdf render-video render-audio render-share; do
            gcloud run jobs update $JOB --image=$IMG --region=us-central1
          done
```

Job-create commands (one-time, then `gcloud run jobs update` thereafter):

```bash
IMG=us-central1-docker.pkg.dev/vismay-render/render/render-runner:latest
SECRETS="NEXT_PUBLIC_SUPABASE_URL=NEXT_PUBLIC_SUPABASE_URL:latest,\
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,\
NEXT_PUBLIC_MAPBOX_TOKEN=NEXT_PUBLIC_MAPBOX_TOKEN:latest,\
ADMIN_PASSWORD=ADMIN_PASSWORD:latest,\
ADMIN_SESSION_SECRET=ADMIN_SESSION_SECRET:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest"

# PDF — 2 vCPU / 4 GiB / 15 min, same as GHA timeout
gcloud run jobs create render-pdf \
  --image=$IMG \
  --region=us-central1 \
  --service-account=render-runner@vismay-render.iam.gserviceaccount.com \
  --set-secrets="$SECRETS" \
  --set-env-vars="JOB_TYPE=pdf,CONTENT_SOURCE=db" \
  --cpu=2 --memory=4Gi --task-timeout=900s --max-retries=0

# Video — 4 vCPU / 8 GiB / 60 min (ffmpeg + Chromium concurrent)
gcloud run jobs create render-video \
  --image=$IMG \
  --region=us-central1 \
  --service-account=render-runner@vismay-render.iam.gserviceaccount.com \
  --set-secrets="$SECRETS" \
  --set-env-vars="JOB_TYPE=video,CONTENT_SOURCE=db" \
  --cpu=4 --memory=8Gi --task-timeout=3600s --max-retries=0

# Audio — 1 vCPU / 2 GiB / 30 min (TTS-bound, mostly waiting on Gemini)
gcloud run jobs create render-audio \
  --image=$IMG \
  --region=us-central1 \
  --service-account=render-runner@vismay-render.iam.gserviceaccount.com \
  --set-secrets="$SECRETS" \
  --set-env-vars="JOB_TYPE=audio,CONTENT_SOURCE=db" \
  --cpu=1 --memory=2Gi --task-timeout=1800s --max-retries=0

# Share — same shape as PDF
gcloud run jobs create render-share \
  --image=$IMG \
  --region=us-central1 \
  --service-account=render-runner@vismay-render.iam.gserviceaccount.com \
  --set-secrets="$SECRETS" \
  --set-env-vars="JOB_TYPE=share,CONTENT_SOURCE=db" \
  --cpu=2 --memory=4Gi --task-timeout=900s --max-retries=0
```

---

## 5. Dispatch code changes

The four dispatch files in `packages/content-source/src/` ([storyPdfDispatch.ts](packages/content-source/src/storyPdfDispatch.ts), [storyVideoDispatch.ts](packages/content-source/src/storyVideoDispatch.ts), [storyAudioDispatch.ts](packages/content-source/src/storyAudioDispatch.ts), [storyShareDispatch.ts](packages/content-source/src/storyShareDispatch.ts)) keep their **exported function signatures unchanged** so callers like [packages/content-source/src/handlers/storyPdf.ts:115](packages/content-source/src/handlers/storyPdf.ts:115) don't need to be touched. Only the internals swap.

Shared helper in a new file `packages/content-source/src/cloudRunDispatch.ts`:

```typescript
/**
 * Trigger a Cloud Run Job execution.
 *
 * Replaces the GitHub Actions `workflow_dispatch` path. Authenticates with
 * a service-account JSON key from env (GCP_RUN_DISPATCH_SA_KEY) using
 * google-auth-library, then POSTs to
 *   POST /v2/{name=projects/*\/locations/*\/jobs/*}:run
 * with a `containerOverrides[0].env` array that injects the per-invocation
 * inputs (SLUG, FORMAT, etc.) as env vars on the job's single task.
 *
 * Required server-only env:
 *   GCP_RUN_DISPATCH_SA_KEY   JSON for the render-trigger SA (whole file, one line)
 *   GCP_RUN_DISPATCH_PROJECT  e.g. "vismay-render"
 *   GCP_RUN_DISPATCH_REGION   e.g. "us-central1"
 */
import { GoogleAuth } from 'google-auth-library'

let cachedAuth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth
  const raw = process.env.GCP_RUN_DISPATCH_SA_KEY
  if (!raw) throw new Error('GCP_RUN_DISPATCH_SA_KEY not set')
  cachedAuth = new GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  return cachedAuth
}

export function isCloudRunDispatchConfigured(): boolean {
  return Boolean(
    process.env.GCP_RUN_DISPATCH_SA_KEY &&
      process.env.GCP_RUN_DISPATCH_PROJECT &&
      process.env.GCP_RUN_DISPATCH_REGION,
  )
}

export async function runCloudRunJob(args: {
  jobName: string                       // e.g. "render-pdf"
  envOverrides: Record<string, string>  // SLUG, FORMAT, BASE_URL, ...
}): Promise<void> {
  const project = process.env.GCP_RUN_DISPATCH_PROJECT!
  const region = process.env.GCP_RUN_DISPATCH_REGION!
  const name = `projects/${project}/locations/${region}/jobs/${args.jobName}`

  const auth = getAuth()
  const client = await auth.getClient()
  const headers = await client.getRequestHeaders()

  const res = await fetch(`https://run.googleapis.com/v2/${name}:run`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: Object.entries(args.envOverrides).map(([name, value]) => ({
              name,
              value,
            })),
          },
        ],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Cloud Run jobs.run failed: ${res.status} ${body.slice(0, 400)}`,
    )
  }
  // 200 OK with a long-running operation body. We don't wait — the script
  // writes to Supabase when done, just like the GHA path.
}
```

Then [packages/content-source/src/storyPdfDispatch.ts](packages/content-source/src/storyPdfDispatch.ts) becomes:

```typescript
import type { PdfFormat } from './storyPdf'
import { isCloudRunDispatchConfigured, runCloudRunJob } from './cloudRunDispatch'

// Feature flag: 'gcp' (default once cutover complete) | 'gha' (legacy fallback).
// Reads RENDER_BACKEND_PDF first, then RENDER_BACKEND, then defaults to 'gha'
// until the cutover is done so the migration is opt-in per pipeline.
function backend(): 'gha' | 'gcp' {
  const v =
    process.env.RENDER_BACKEND_PDF ??
    process.env.RENDER_BACKEND ??
    'gha'
  return v === 'gcp' ? 'gcp' : 'gha'
}

export function isPdfDispatchConfigured(): boolean {
  if (backend() === 'gcp') return isCloudRunDispatchConfigured()
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO,
  )
}

export async function dispatchPdfRenderJob(args: {
  slug: string
  format: PdfFormat
  baseUrl: string
}): Promise<void> {
  if (backend() === 'gcp') {
    return runCloudRunJob({
      jobName: 'render-pdf',
      envOverrides: {
        SLUG: args.slug,
        FORMAT: args.format,
        BASE_URL: args.baseUrl,
      },
    })
  }
  // ─── Legacy GHA path (unchanged) ────────────────────────────────────
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/render-pdf.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref,
        inputs: { slug: args.slug, format: args.format, base_url: args.baseUrl },
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub workflow dispatch failed: ${res.status} ${body.slice(0, 300)}`)
  }
}
```

The other three dispatch files follow the same pattern — only the `jobName` and `envOverrides` mapping change. Diff for `storyVideoDispatch.ts` (the most complex inputs):

```diff
+import { isCloudRunDispatchConfigured, runCloudRunJob } from './cloudRunDispatch'
+
+function backend(): 'gha' | 'gcp' {
+  return (process.env.RENDER_BACKEND_VIDEO ?? process.env.RENDER_BACKEND ?? 'gha') === 'gcp' ? 'gcp' : 'gha'
+}
+
 export function isVideoDispatchConfigured(): boolean {
+  if (backend() === 'gcp') return isCloudRunDispatchConfigured()
   return Boolean(
     process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
   )
 }

 export async function dispatchVideoRenderJob(args: {
   slug: string
   aspect: VideoAspect
   baseUrl: string
   range?: VideoRange
 }): Promise<void> {
+  if (backend() === 'gcp') {
+    return runCloudRunJob({
+      jobName: 'render-video',
+      envOverrides: {
+        SLUG: args.slug,
+        ASPECT: args.aspect,
+        BASE_URL: args.baseUrl,
+        START_MS: args.range ? String(args.range.startMs) : '',
+        END_MS: args.range ? String(args.range.endMs) : '',
+      },
+    })
+  }
   // existing GHA path...
 }
```

`google-auth-library` adds ~2 MB to the Vercel bundle but is well-tree-shaken. It's the same library Google publishes for all their Node clients, no third-party deps.

**New Vercel env vars** (admin + vizmaya-fyi apps):
- `GCP_RUN_DISPATCH_SA_KEY` (sensitive) — full JSON for the `render-trigger@` SA, one line.
- `GCP_RUN_DISPATCH_PROJECT` — `vismay-render`.
- `GCP_RUN_DISPATCH_REGION` — `us-central1`.
- `RENDER_BACKEND` and/or `RENDER_BACKEND_PDF` / `_VIDEO` / `_AUDIO` / `_SHARE` — feature flag(s). Default behavior is `gha` until all four are explicitly set to `gcp`.

Old GHA dispatch envs (`GITHUB_DISPATCH_TOKEN`, `GITHUB_DISPATCH_REPO`, `GITHUB_DISPATCH_REF`) **stay set** during rollout so the fallback path keeps working. Remove after the cutover is stable.

---

## 6. Env var migration

| Var | GHA location | GCP location | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | repo env `Production` secrets | Secret Manager → `NEXT_PUBLIC_SUPABASE_URL` | Same value across all four jobs |
| `SUPABASE_SERVICE_ROLE_KEY` | repo env `Production` secrets | Secret Manager → `SUPABASE_SERVICE_ROLE_KEY` | Same value |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | repo env `Production` secrets | Secret Manager → `NEXT_PUBLIC_MAPBOX_TOKEN` | Not needed by audio; mounting anyway is harmless |
| `ADMIN_PASSWORD` | repo env `Production` secrets | Secret Manager → `ADMIN_PASSWORD` | Needed by PDF + share (see [.github/workflows/render-pdf.yml:14](.github/workflows/render-pdf.yml:14)) |
| `ADMIN_SESSION_SECRET` | repo env `Production` secrets | Secret Manager → `ADMIN_SESSION_SECRET` | Needed by PDF + share — same value as Vercel deployments per [.github/workflows/render-pdf.yml:18](.github/workflows/render-pdf.yml:18) |
| `GEMINI_API_KEY` | repo env `Production` secrets | Secret Manager → `GEMINI_API_KEY` | Needed by audio only |
| `CONTENT_SOURCE=db` | inline in each workflow yml | inline in job spec (`--set-env-vars`) | Not a secret; per [.github/workflows/render-pdf.yml:86](.github/workflows/render-pdf.yml:86) it stays `db` for prod |

Secrets are mounted via `--set-secrets=NAME=SECRET_ID:latest` on each `gcloud run jobs create/update`. Cloud Run mounts them as env vars at task start, so the script sees them via `process.env.X` exactly as before — no script changes needed.

Add an explicit `pinned-version` (`SECRET_ID:1`, `:2`, ...) once we stop rotating: prevents a rotation from silently breaking renders. Until then, `:latest` is fine — we control all the writers.

---

## 7. Rollout strategy

**Order: PDF → share → audio → video**, with each step gated on at least 48 hours of clean prod traffic before the next.

PDF first because:
- Smallest blast radius (single-page render, no audio/ffmpeg).
- Lowest variance (15-min ceiling, usually completes in ~60 s).
- The most-trafficked workflow today after share, so we get signal fast.

Share second because:
- Same image, same Chromium-only requirements.
- Triggered by admins, not end users — failures don't block public traffic.

Audio third because:
- No Chromium, so it exercises a new code path (just `tsx scripts/generate-audio.ts`). Verifies the entrypoint dispatcher handles non-Playwright invokes cleanly.
- Long-running but synchronous, so timeout sensitivity is moderate.

Video last because:
- 60-minute timeouts, large memory, ffmpeg-heavy. Highest risk.
- Most expensive to re-run if it fails.

The flag `RENDER_BACKEND_<KIND>` lets each pipeline flip independently:

```
# Day 0 (pre-rollout): all on GHA
RENDER_BACKEND_PDF=gha
RENDER_BACKEND_VIDEO=gha
RENDER_BACKEND_AUDIO=gha
RENDER_BACKEND_SHARE=gha

# Day 1: PDF cuts over
RENDER_BACKEND_PDF=gcp
RENDER_BACKEND_VIDEO=gha    # unchanged
RENDER_BACKEND_AUDIO=gha
RENDER_BACKEND_SHARE=gha

# ...etc through to Day 5 once video is in:
RENDER_BACKEND=gcp   # collapse to a single flag
```

Per pipeline cutover checklist:
1. Deploy the image (build pipeline already in place).
2. Flip the `RENDER_BACKEND_<KIND>` env var in Vercel for both `apps/vizmaya-fyi` and (where relevant) `apps/admin`.
3. Trigger one real render via the UI. Watch Cloud Logging in a side panel.
4. Check the Supabase row appears with `public_url` set and `content_revision_hash` matches.
5. Trigger the same render again — should hit the cache (200 immediately), confirming the cache key match.
6. Wait 48 hours; if no errors in Cloud Logging or Sentry, proceed to next pipeline.

After all four are stable, remove the `RENDER_BACKEND_*` flags, the GHA fallback code in each dispatch file, and the four render workflow YAMLs.

---

## 8. Observability

**Logs:** Cloud Run Jobs writes stdout/stderr to Cloud Logging automatically. The script already logs via `console.log` (see [apps/vizmaya-fyi/scripts/generate-pdf.ts:67](apps/vizmaya-fyi/scripts/generate-pdf.ts:67)), so log statements flow through without change.

**To find a failing render:**

```
# In Cloud Console → Logging → Logs Explorer, paste:
resource.type="cloud_run_job"
resource.labels.job_name="render-pdf"
severity>=ERROR
```

To find a specific execution by slug:

```
resource.type="cloud_run_job"
resource.labels.job_name="render-pdf"
textPayload =~ "south-korea-gpu-hour"
```

To watch executions live during the rollout (terminal):

```bash
gcloud beta run jobs executions list --job=render-pdf --region=us-central1 --limit=10
gcloud beta run jobs executions describe <EXECUTION> --region=us-central1
gcloud beta run jobs executions logs <EXECUTION> --region=us-central1
```

**Comparison to GHA:**
- GHA UI shows each step's log + cumulative duration, with per-step exit codes — nice for "where did it fail?" debugging.
- Cloud Logging is one big text stream per execution, but searchable across runs, retained 30 days by default, and integrates with Cloud Monitoring alerts.
- One regression: no nice "re-run" button per execution. Mitigated by the `gcloud run jobs execute render-pdf --update-env-vars=SLUG=...` command, which we can wrap in a small admin tool if it becomes a pain.

**Alerting (post-rollout):**
- Log-based metric on `severity=ERROR` for each job, alert if count > 0 in 5 min.
- Job-execution-failed metric (`run.googleapis.com/job/completed_execution_count` with `result=failed`) — alert if any in 1 h.
- Both fire to PagerDuty/Slack via Monitoring's notification channels.

For Sentry users: the script already runs unmodified, so any existing `@sentry/node` init in `apps/vizmaya-fyi/lib/storyPdfRender.ts` (if present) will continue to flush errors to Sentry from inside the container. Worth confirming during PDF rollout.

---

## 9. Cost model

Numbers are back-of-envelope; revisit after one month of real usage.

**Current GHA cost** (private repo, 2-core `ubuntu-latest`, $0.008/min):
- PDF: ~60 s/render, ~50 renders/day → 50 min/day → $12/month
- Video: ~30 min/render, ~5 renders/day → 150 min/day → $36/month
- Audio: ~10 min/render, ~2 renders/day → 20 min/day → $5/month
- Share: ~60 s/render, ~20 renders/day → 20 min/day → $5/month
- **Subtotal: ~$58/month** (rough, ignoring queue overhead)

**Cloud Run Jobs cost** (us-central1, 2nd-gen execution env):
- vCPU: $0.0000024/vCPU-s
- Memory: $0.00000025/GiB-s
- Requests: $0.40/million

| Job | CPU·s/run | Mem·GiB·s/run | Runs/day | Daily $ |
|---|---|---|---|---|
| PDF (2 vCPU·60 s) | 120 | 240 | 50 | $0.0182 |
| Video (4 vCPU·1800 s) | 7,200 | 14,400 | 5 | $0.1188 |
| Audio (1 vCPU·600 s) | 600 | 1,200 | 2 | $0.0035 |
| Share (2 vCPU·60 s) | 120 | 240 | 20 | $0.0073 |

Monthly total: ~$4.50. Plus egress to Supabase (negligible — already in the same region tier), Artifact Registry storage (one ~2 GB image at $0.10/GB/month = $0.20/month), Secret Manager (essentially free at this volume).

**Order of magnitude: Cloud Run is ~10× cheaper than GHA at our current volume.** Even if rendering doubles, it's still ~$10/month vs $120/month. The break-even point where GHA becomes cheaper is essentially never for this workload — Cloud Run's per-second billing on idle-to-billed-time is much tighter than GHA's per-minute.

Cold-start adds ~25 s to billed time for the first invoke of an instance; subsequent invokes in the same instance amortize that to zero. With 50 PDF renders/day spread roughly evenly, cold-start hits about half — that adds ~15 min/day of billing, ~$0.005/day. Noise.

Worth noting: this doesn't account for Cloud Build minutes if we'd gone that route, or for GHA minutes consumed by the new `build-render-image.yml` workflow (one ~5 min build per code change, maybe 5-10/day during active dev → 25-50 min/day, $0.20-0.40/day — also noise).

---

## 10. Rollback plan

The feature flag from §7 is 95% of the rollback. To revert one pipeline:

```
# Vercel dashboard → vizmaya-fyi → Environment Variables → Production
RENDER_BACKEND_PDF=gha   # was gcp
# Redeploy (Vercel auto-rebuilds on env change for non-build-time vars
# but render dispatch reads at request time, so a 1-line override is
# instant once the Vercel cache flushes ~30 s).
```

The GHA workflow YAMLs stay in `.github/workflows/` and the GHA repo secrets stay intact until all four pipelines are stable. Hard rollback is "flip all four flags back to `gha`" with no code change.

**If the Cloud Run image itself is broken** (e.g. a release bumped Playwright incompatibly):

```bash
# Pin all four jobs to the last known-good SHA
GOOD_SHA=abc1234...
IMG=us-central1-docker.pkg.dev/vismay-render/render/render-runner:$GOOD_SHA
for JOB in render-pdf render-video render-audio render-share; do
  gcloud run jobs update $JOB --image=$IMG --region=us-central1
done
```

**If the trigger SA key leaks:**

```bash
gcloud iam service-accounts keys list \
  --iam-account=render-trigger@vismay-render.iam.gserviceaccount.com
gcloud iam service-accounts keys delete <KEY_ID> \
  --iam-account=render-trigger@vismay-render.iam.gserviceaccount.com
# Then create a new one, paste into Vercel.
```

Future improvement (post-rollout): switch the Vercel app to OIDC with Vercel's `VERCEL_OIDC_TOKEN` and workload identity federation so we don't have a static SA key at all. Out of scope for this migration.

**If migrations stall** (e.g. PDF works but video repeatedly OOMs at 8 GiB): leave video on GHA indefinitely. The dispatch flag is per-pipeline, so partial migration is a stable end state, not a bug.

---

## 11. Open questions / risks

Numbered so they can be tracked off this doc.

**11.1 Memory headroom for PDF (Mapbox + ECharts at full res).** The current GHA `ubuntu-latest` runner is ~7 GB usable. We're proposing 4 GiB for PDF. The PDF route renders `/story/<slug>/report` and `/story/<slug>/slides` at 1920×1080-ish with multiple Mapbox tiles + ECharts canvases per page. **Risk: OOM in production on the biggest stories.** Validation plan: during PDF rollout day, render the three biggest known stories (visible in `apps/vizmaya-fyi/content/stories/`) with `--memory=4Gi`, watch Cloud Logging for `JavaScript heap out of memory` or container kill events. Bump to 8 GiB if any fail.

**11.2 Cold start vs polling window.** The handler at [packages/content-source/src/handlers/storyPdf.ts:117](packages/content-source/src/handlers/storyPdf.ts:117) returns 202 immediately after dispatch and the client polls every 3 s. Cloud Run Jobs cold-start for a 2 GB image is 15-30 s. **This is fine** because the user doesn't see a blocking spinner during dispatch — they see "rendering, this may take a minute". But it's worth verifying that the script's first write to the Supabase cache row (the thing the poller is waiting for) happens within ~90 s including cold start, so the user doesn't time out their patience.

**11.3 pnpm workspace install inside the container.** The Dockerfile filters to `--filter vizmaya-fyi... --filter @vismay/content-source...` to keep the image small. Risk: a transitive workspace dep (e.g. `@vismay/viz-engine` reachable from `@vismay/content-source/storyVideo`) gets pruned. Validation: build the image locally, run `pnpm exec tsx scripts/generate-pdf.ts <slug> report --force` inside the container with real Supabase creds, see if it completes. If pruning misbehaves, fall back to `pnpm install --frozen-lockfile` with no filter — image grows by ~200 MB, no functional change.

**11.4 `signOutputUrl` cross-package dep.** [apps/vizmaya-fyi/scripts/generate-share.ts:24](apps/vizmaya-fyi/scripts/generate-share.ts:24) imports from `@vismay/admin-core/signedUrl`. We need `packages/admin-core/` in the image too, confirmed in §2/§3. Audit before first build: is anything else in `apps/vizmaya-fyi/lib/storyPdfRender.ts` or `lib/storyVideoRender.ts` importing from `apps/admin/` or `packages/admin-core/` that we missed? Grep before merging the Dockerfile.

**11.5 BASE_URL pointing at Vercel during render.** The script navigates Chromium to e.g. `https://vizmaya.fyi/story/<slug>/report?print=1`. If we're rendering a still-unpublished story (admin builder workflow), the slug exists in Postgres but the Vercel route hasn't seen it yet. Today GHA hits the same Vercel URL, so this isn't a regression — but worth verifying that the admin app passes the right `BASE_URL` to the dispatch (look for `baseUrl` construction at [packages/content-source/src/handlers/storyPdf.ts:83](packages/content-source/src/handlers/storyPdf.ts:83)).

**11.6 Concurrency limits.** Cloud Run Jobs default to 1 task per execution and unlimited concurrent executions. If two users click "Download PDF" for the same slug within 1 s, we'd spawn two parallel jobs. The handler at [packages/content-source/src/handlers/storyPdf.ts:100](packages/content-source/src/handlers/storyPdf.ts:100) already deduplicates via the `cached` state check + `markPdfDispatched`, so this is solved at the application layer — but worth confirming the dedup works the same way on a hot start (Vercel may serve both requests from different lambdas).

**11.7 Region for the Cloud Run project.** Vercel typically serves from `iad1`/`sfo1`; the Supabase project's region matters for write latency. Pick `us-central1` only if Supabase is also US-Central. If Supabase is `eu-central-1` or `ap-south-1`, switch the GCP region accordingly. **Action item: check the Supabase project's region before §1.**

**11.8 Secret rotation.** With `:latest` Secret Manager references, a rotation requires either rolling each job (instances pick up new secrets only on cold start) or pinning to a versioned reference and updating the job spec on each rotation. For the current cadence (rare), `:latest` + accepting that running tasks finish with the old secret is fine. Document this in the runbook.

**11.9 GHA workflow YAML cleanup timing.** Don't delete `.github/workflows/render-*.yml` until the GHA fallback branches in the dispatch files are also removed. The flag-based branching is the safety net; the workflows are the second layer of safety.

**11.10 Cost monitoring.** Set a $50/month budget alert on the `vismay-render` project so any runaway loop (e.g. handler bug that dispatches in a tight loop) gets caught before it racks up serious money. `gcloud billing budgets create` if not done in §1.

---

## Files this plan touches

Existing files modified:
- [packages/content-source/src/storyPdfDispatch.ts](packages/content-source/src/storyPdfDispatch.ts) — flag-gated GCP path
- [packages/content-source/src/storyVideoDispatch.ts](packages/content-source/src/storyVideoDispatch.ts) — flag-gated GCP path
- [packages/content-source/src/storyAudioDispatch.ts](packages/content-source/src/storyAudioDispatch.ts) — flag-gated GCP path
- [packages/content-source/src/storyShareDispatch.ts](packages/content-source/src/storyShareDispatch.ts) — flag-gated GCP path

Existing files removed after cutover:
- [.github/workflows/render-pdf.yml](.github/workflows/render-pdf.yml)
- [.github/workflows/render-video.yml](.github/workflows/render-video.yml)
- [.github/workflows/render-audio.yml](.github/workflows/render-audio.yml)
- [.github/workflows/render-share.yml](.github/workflows/render-share.yml)

New files added:
- `infra/render-runner/Dockerfile`
- `infra/render-runner/entrypoint.sh`
- `packages/content-source/src/cloudRunDispatch.ts`
- `.github/workflows/build-render-image.yml`
- `.dockerignore` (repo root)
