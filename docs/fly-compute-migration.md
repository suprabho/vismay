# Fly.io compute for the vizf1 AI pipeline (and worker jobs)

Run the vizf1 AI pipeline — and, optionally, the existing vizf1 ingest worker — on **Fly.io Machines** instead of GitHub Actions `workflow_dispatch` / cron.

This is the compute substrate for the pipeline designed in [docs/vizf1-ai-pipeline-integration.md](docs/vizf1-ai-pipeline-integration.md). It is the **lightweight-worker** counterpart to [docs/gcp-render-migration.md](docs/gcp-render-migration.md), which targets the heavy Playwright/ffmpeg render jobs. The two are independent: render jobs and pipeline jobs are different workloads (a ~2 GB Chromium image vs a ~400 MB Node image), so they can live on different substrates without conflict. See §11 for when to pick Fly vs Cloud Run vs GHA.

## TL;DR

- Run the vizf1 AI pipeline stages (A signals → B angles → D stories, all `tsx` over `@vismay/ai-gateway` + Supabase) on **Fly Machines**. The pipeline *logic* (`apps/vizf1/worker/src/pipeline/*`) is unchanged — **only invocation changes**.
- **One lightweight worker image** (~400 MB: Node 22 + pnpm + the worker's workspace deps, no Chromium/ffmpeg) → boots in ~1–2 s. An order of magnitude smaller/faster than the render image.
- **Two execution shapes** (§2): **Shape 1** — admin spins up an on-demand Machine per run via the Machines API (recommended: scale-to-zero, mirrors the current dispatch model). **Shape 2** — a persistent worker consumes `vizf1_story_runs` as a queue (simplest trigger, tiny always-on cost).
- **Dispatch swap**: admin `POST /api/vizf1/runs` calls the Fly Machines API instead of `workflow_dispatch`. Feature-flagged `PIPELINE_BACKEND=gha|fly` so it's reversible.
- **Secrets** via `fly secrets`; **region** pinned to Supabase's region for low write latency; **least-privilege deploy token** scoped to the one app (mirrors GCP's trigger-SA pattern).
- **Cron** (vizf1 ingest: news / race-weekend) can stay on GHA cron (recommended — it works and is free) or move to Fly scheduled machines (§6).
- **Cost**: a few dollars/month, scale-to-zero. CPU is mostly idle (jobs wait on the LLM), so `shared-cpu-1x` is plenty.

The biggest unknowns are (a) whether a Fly deploy token in the Vercel admin is acceptable vs the queue model (Shape 2 avoids it), and (b) Fly Machines `schedule` only supports `hourly|daily|weekly|monthly` presets — fine for nightly news ingest, awkward for race-weekend cadence, so cron likely stays on GHA. Both resolved by the shape/cron choices below.

---

## 1. Scope — what runs where

| Workload | Today | Proposed | Notes |
|---|---|---|---|
| vizf1 AI pipeline — Stage A/B/D (on-demand) | (new) planned on GHA `workflow_dispatch` | **Fly Machines (on-demand)** | The new need this doc primarily addresses |
| vizf1 ingest — news / sessions / circuits / story-segments (cron) | GHA cron (`vizf1-ingest-news.yml`, `vizf1-race-weekend.yml`) | **Keep on GHA** (or Fly scheduled, §6) | Works today; low value to move |
| Render jobs — PDF / video / audio / share | GHA `workflow_dispatch` | **GCP Cloud Run** ([gcp doc](docs/gcp-render-migration.md)) — or Fly (§11) | Heavy Chromium/ffmpeg; different image |

**Why Fly for the pipeline specifically:** the jobs are bursty, minutes-long, and LLM-bound. Fly Machines boot a prebuilt image in ~1–2 s (no per-run `pnpm install`), scale to zero between runs, let us co-locate next to Supabase, give us first-class log streaming, and let us cap concurrency. GitHub Actions is a CI system pressed into service as a job runner — it works (proven by the existing cron) but cold-starts a fresh runner + installs deps every time, caps at 6 h, and surfaces logs poorly to a product UI.

---

## 2. Execution shapes

Both leave `apps/vizf1/worker/src/pipeline/run.ts` and all stage code untouched — they differ only in how a run is *started*.

### Shape 1 — on-demand Machine per run (recommended)

Mirrors the existing dispatch mental model and keeps the admin stateless.

```
admin POST /api/vizf1/runs
  → insert vizf1_story_runs (status='queued')           # the run row
  → dispatchPipelineRunJob()  →  Fly Machines API: create machine
        config.env = { RUN_ID, SESSION_ID, STAGE }
        config.auto_destroy = true ; restart.policy = 'no'
  → machine boots worker image, runs `tsx src/pipeline/run.ts`,
        writes vizf1_workflow_events + patches vizf1_story_runs.status,
        exits → auto-destroys
admin UI subscribes to vizf1_story_runs / events via Supabase realtime  (unchanged)
```

- **Trigger:** one Machines API POST. Needs a Fly deploy token in the admin env (`FLY_API_TOKEN`, app-scoped).
- **Cost:** pure scale-to-zero — you pay only for the seconds a machine runs.
- **Concurrency:** one machine per run; cap parallel runs in the admin route (refuse if N machines already running for the app, or rely on a per-session dedupe like the render handlers' `markDispatched`).

### Shape 2 — persistent worker, `vizf1_story_runs` as the queue

```
admin POST /api/vizf1/runs → insert vizf1_story_runs (status='queued')   # that's it
Fly worker (always-on, 1 machine):
  subscribe to Supabase realtime on vizf1_story_runs (status='queued')
  claim a row:  update vizf1_story_runs set status='running'
                where id=$1 and status='queued' returning *      # atomic claim
  run the stage; write events; set status='done'|'failed'
```

- **Trigger:** just insert a row — **no Fly token in admin, no dispatch indirection.** Elegant because the run table *is* the queue.
- **Cost:** one tiny always-on machine (e.g. `shared-cpu-1x@256MB`) — a few dollars/month even at zero traffic.
- **Concurrency:** you own it (claim-with-`returning`, or a small worker pool). Add `for update skip locked` semantics via the atomic update.

**Recommendation: Shape 1.** It preserves scale-to-zero and the dispatch model already used across the repo, and the admin route is a near-drop-in of the GCP doc's `runCloudRunJob`. Choose Shape 2 only if you'd rather not hold a Fly token in Vercel and accept a small always-on cost.

---

## 3. Fly setup

```bash
# 1. One app for the pipeline worker. No public service — it only runs jobs.
fly apps create vizf1-pipeline --org promad

# 2. Pin the primary region to Supabase's region (low write latency).
#    Check the Supabase project region first; e.g. AWS us-east-1 → Fly 'iad'.
fly regions set iad -a vizf1-pipeline           # (set during first deploy via fly.toml)

# 3. Secrets — same values as the worker's .env / GHA secrets. Injected as env at runtime.
fly secrets set -a vizf1-pipeline \
  NEXT_PUBLIC_SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  AI_GATEWAY_API_KEY=... \
  GEMINI_API_KEY=...

# 4. Least-privilege deploy token for the admin to call the Machines API.
#    Scoped to THIS app only — it can't touch other Fly apps. Paste into Vercel
#    as FLY_API_TOKEN (admin + any app that dispatches runs).
fly tokens create deploy -a vizf1-pipeline --expiry 8760h
```

> The deploy token is the Fly analog of the GCP `render-trigger` SA: app-scoped, dispatch-only. Keep the JSON/string in a password manager and rotate via `fly tokens revoke` + re-create.

---

## 4. Worker image + `fly.toml`

The worker is plain Node — no Playwright base, no ffmpeg. Build context is the **monorepo root** (workspace deps).

`apps/vizf1/worker/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /app

# ─── deps (cached unless a manifest/lockfile changes) ───
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/vizf1/worker/package.json apps/vizf1/worker/
COPY packages/ai-gateway/package.json packages/ai-gateway/
COPY packages/story-pipeline/package.json packages/story-pipeline/
COPY packages/eval-entities/package.json packages/eval-entities/
COPY apps/vizf1/brand/package.json apps/vizf1/brand/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @vizf1/worker...

# ─── runtime ───
FROM deps AS runtime
COPY apps/vizf1/worker apps/vizf1/worker
COPY packages/ai-gateway packages/ai-gateway
COPY packages/story-pipeline packages/story-pipeline
COPY packages/eval-entities packages/eval-entities
COPY apps/vizf1/brand apps/vizf1/brand
COPY turbo.json ./
WORKDIR /app/apps/vizf1/worker
# Source-exported TS workspaces (main: src/index.ts) → tsx compiles at runtime,
# no build step. Default command is the pipeline runner; env selects the stage.
CMD ["pnpm", "exec", "tsx", "src/pipeline/run.ts"]
```

`apps/vizf1/worker/fly.toml`:

```toml
app = "vizf1-pipeline"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"
  # build context is repo root; run `fly deploy` from there with --dockerfile

# No [http_service] — this app runs jobs, it doesn't serve traffic.

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

`.dockerignore` at repo root already excludes `apps/vizf1` for the render image; the Fly build uses a **separate** ignore (`apps/vizf1/worker/.dockerignore` is not how Docker works — instead keep the worker build deliberately copying only what it needs, as above, and rely on the root `.dockerignore` excluding `node_modules`/`.next`/`.turbo`).

`run.ts` reads `process.env.STAGE` (`signals_angles` | `stories`), `SESSION_ID`, `RUN_ID` — exactly the inputs Shape 1 injects as machine env, and the same a manual `pnpm pipeline:run` would take locally. Add to `apps/vizf1/worker/package.json` scripts (mirroring the `ingest:*` / `:ci` convention):

```json
"pipeline:run": "tsx --env-file=.env src/pipeline/run.ts",
"pipeline:run:ci": "tsx src/pipeline/run.ts"
```

---

## 5. Dispatch code changes (Shape 1)

Mirror the GCP doc's approach: a shared helper + a feature flag, so dispatch substrate is swappable and the admin route's logic is unchanged. New file `packages/content-source/src/flyDispatch.ts`:

```typescript
/**
 * Start a Fly Machine to run a one-shot job, then return.
 *
 * Fly analog of cloudRunDispatch.runCloudRunJob. Creates an auto-destroying
 * machine on the pipeline app with per-run env overrides; the machine runs the
 * image's default CMD (tsx src/pipeline/run.ts) and writes results to Supabase,
 * so we don't wait on it — same fire-and-forget contract as the GHA path.
 *
 * Server-only env:
 *   FLY_API_TOKEN        app-scoped deploy token
 *   FLY_PIPELINE_APP     e.g. "vizf1-pipeline"
 *   FLY_PIPELINE_IMAGE   e.g. "registry.fly.io/vizf1-pipeline:<sha>" (set by the build pipeline)
 *   FLY_PIPELINE_REGION  e.g. "iad"
 */
const MACHINES_API = 'https://api.machines.dev/v1'

export function isFlyDispatchConfigured(): boolean {
  return Boolean(
    process.env.FLY_API_TOKEN &&
      process.env.FLY_PIPELINE_APP &&
      process.env.FLY_PIPELINE_IMAGE,
  )
}

export async function runFlyMachine(args: {
  envOverrides: Record<string, string> // RUN_ID, SESSION_ID, STAGE
}): Promise<{ machineId: string }> {
  const app = process.env.FLY_PIPELINE_APP!
  const res = await fetch(`${MACHINES_API}/apps/${app}/machines`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FLY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      region: process.env.FLY_PIPELINE_REGION ?? 'iad',
      config: {
        image: process.env.FLY_PIPELINE_IMAGE,
        env: args.envOverrides,
        auto_destroy: true, // machine removes itself when the process exits
        restart: { policy: 'no' }, // run-to-completion, no restart loop
        guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 1024 },
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`Fly machine create failed: ${res.status} ${(await res.text()).slice(0, 400)}`)
  }
  const body = (await res.json()) as { id: string }
  return { machineId: body.id }
}
```

The admin route `apps/admin/app/api/vizf1/runs/route.ts` (from the integration plan) gets a flag-gated dispatch, exactly like `storyPdfDispatch.ts` switches `gha|gcp`:

```typescript
function pipelineBackend(): 'gha' | 'fly' {
  return (process.env.PIPELINE_BACKEND ?? 'gha') === 'fly' ? 'fly' : 'gha'
}

// inside POST handler, after inserting the queued vizf1_story_runs row:
const overrides = { RUN_ID: run.id, SESSION_ID: sessionId, STAGE: stage }
if (pipelineBackend() === 'fly') {
  await runFlyMachine({ envOverrides: overrides })
} else {
  await dispatchWorkflow('vizf1-ai-pipeline.yml', { run_id: run.id, session_id: sessionId, stage }) // legacy GHA
}
```

**New Vercel env (admin):** `FLY_API_TOKEN` (sensitive), `FLY_PIPELINE_APP`, `FLY_PIPELINE_IMAGE`, `FLY_PIPELINE_REGION`, `PIPELINE_BACKEND` (default `gha` until cutover). The GHA dispatch path + `vizf1-ai-pipeline.yml` stay during rollout as the fallback.

---

## 6. Cron / scheduled jobs

The vizf1 ingest cron (`vizf1-ingest-news.yml`, `vizf1-race-weekend.yml`) is **out of scope to move** by default — it works on GHA cron and is free. If you do want it on Fly:

- **Daily news ingest** → a Fly machine with `schedule = "daily"` in its config running the image with `CMD` overridden to `ingest:news:ci`. Fly's `schedule` field supports only `hourly|daily|weekly|monthly`, which fits daily news fine.
- **Race-weekend ingest** has irregular cadence (per session, weekend-clustered) → presets don't fit. Either keep it on GHA cron, or run a small always-on machine with `supercronic` reading a crontab. Recommendation: **leave race-weekend on GHA**; not worth a scheduler.

Net: only the on-demand AI pipeline moves to Fly; cron stays on GHA. Clean split, minimal new surface.

---

## 7. Build / push pipeline

Keep a tiny GHA workflow that builds the worker image and deploys it to Fly's registry on push to `main` (paths under `apps/vizf1/worker/**`, `packages/{ai-gateway,story-pipeline,eval-entities}/**`, `pnpm-lock.yaml`). `flyctl deploy --build-only --push` produces an image ref; capture the resolved `registry.fly.io/vizf1-pipeline:<sha>` and set it as the Vercel `FLY_PIPELINE_IMAGE` (so prod pins a known-good SHA, exactly like the GCP doc's `RENDER_IMAGE_TAG`).

```yaml
name: Build vizf1 pipeline image
on:
  push:
    branches: [main]
    paths:
      - 'apps/vizf1/worker/**'
      - 'packages/ai-gateway/**'
      - 'packages/story-pipeline/**'
      - 'packages/eval-entities/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/build-vizf1-pipeline-image.yml'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: |
          flyctl deploy --remote-only \
            --config apps/vizf1/worker/fly.toml \
            --dockerfile apps/vizf1/worker/Dockerfile \
            --image-label "${{ github.sha }}"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_DEPLOY_TOKEN }}
```

(`--remote-only` builds on Fly's builders so we don't need Docker on the runner. For Shape 1 the deploy just publishes the image the Machines API references; no long-running service is started.)

---

## 8. Observability

- **Logs:** `fly logs -a vizf1-pipeline` streams stdout/stderr; `fly machine status <id>` for a single run. The worker already logs via `console.log` (see `buildStorySegments.ts`) so output flows through unchanged.
- **Product-facing status:** the durable record is in Supabase — `vizf1_story_runs.status` + `vizf1_workflow_events` rows the runner writes per step. The admin RunsPanel reads these via Supabase realtime (Shape 1 and 2 identical here). This is the source of truth, not Fly logs.
- **Failures:** `auto_destroy` machines disappear on success; on a crash the machine stops (not destroyed) so `fly machine status`/`fly logs` retain the trace. Set the runner to write `status='failed'` + an error event in a `try/catch` so a failure is visible in the UI even if the machine is gone.
- **Alerting:** a Supabase scheduled function (or a cheap cron) that flags `vizf1_story_runs` stuck in `running` > N minutes, or any `failed` in the last hour → Slack.

---

## 9. Cost model

`shared-cpu-1x` @ 1 GB ≈ $0.0000008/s for CPU + RAM combined (order of magnitude). The pipeline jobs are LLM-bound — the machine mostly waits on `ai-gateway`, so CPU is near-idle and the cheapest guest is fine.

| | per run | runs/day | $/month (Shape 1) |
|---|---|---|---|
| signals+angles (~3 min) | ~180 s | ~10 | ~$0.04 |
| stories (~5 min/run, several angles) | ~300 s | ~10 | ~$0.07 |

So **well under $1/month of compute** at pilot volume; the dominant cost is the LLM spend (tracked separately in `ai_generations`). Shape 2 adds one always-on `shared-cpu-1x@256MB` ≈ **$2–3/month**. Either way it's noise next to LLM tokens.

Boot adds ~1–2 s to each run (prebuilt image, no install) vs GHA's ~30–60 s runner-spin + `pnpm install` — Fly is both cheaper and faster to first-byte here.

---

## 10. Rollback

The `PIPELINE_BACKEND` flag is the rollback: set it back to `gha` in Vercel and the admin route dispatches to `vizf1-ai-pipeline.yml` again. Keep the GHA workflow + GHA dispatch branch until Fly is stable (mirrors the GCP doc's keep-the-fallback discipline). If the **image** is broken, pin `FLY_PIPELINE_IMAGE` to the last-good `<sha>`. If the **token leaks**, `fly tokens revoke <id>` + re-create + update Vercel.

---

## 11. Fly vs Cloud Run vs GHA — when to pick which

| | GitHub Actions | GCP Cloud Run Jobs | Fly Machines |
|---|---|---|---|
| Best for | cron, CI-adjacent tasks | heavy render jobs (the [gcp doc](docs/gcp-render-migration.md)) | bursty on-demand worker/LLM jobs |
| Cold start | ~30–60 s (runner + install) | ~15–30 s (2 GB image pull) | ~1–2 s (small image) |
| Scale-to-zero | n/a (free minutes) | yes | yes |
| Image size here | n/a | ~2 GB (Chromium+ffmpeg) | ~400 MB (Node) |
| Dispatch | `workflow_dispatch` REST | Cloud Run Admin API + SA key | Machines API + deploy token |
| Arbitrary cron | yes | via Cloud Scheduler | presets only (hourly/daily/…) |
| Already in repo | yes | planned | new |

**Guidance:** keep **render jobs on Cloud Run** (the GCP plan is already detailed and the Playwright base fits Cloud Run's model). Put the **AI pipeline on Fly** (fast boot + scale-to-zero suit bursty LLM batch work better than either alternative). Keep **cron on GHA** (free, works). It's fine to run all three substrates — they map to genuinely different workloads. If the team prefers to consolidate, Fly Machines can host the render jobs too (build the render image, create a higher-spec guest, `auto_destroy` per render) — see the GCP doc's new Fly section.

---

## 12. Open questions / risks

1. **Fly token in Vercel (Shape 1).** App-scoped deploy token limits blast radius, but it's still a static secret in the admin. Shape 2 avoids it entirely (the run table is the queue). Decide per security appetite.
2. **`auto_destroy` vs post-mortem.** Auto-destroyed machines erase their local logs on success; rely on `vizf1_workflow_events` for the durable trail and only inspect `fly logs` for crashes (stopped, not destroyed). Ensure the runner's `catch` always writes a failure event.
3. **Region match with Supabase.** Pin `primary_region` to Supabase's region; cross-region writes add latency to every event insert. Confirm the Supabase region before `fly apps create` (same action item as the GCP doc's §11.7).
4. **Concurrency caps (cost & rate limits).** A full grid (drivers × angles + teams) could fan out many LLM calls. Cap runs/angles per job (port f1_backend's `MAX_TOTAL_ANGLES`/`STORY_CONCURRENCY` as worker env) and, in Shape 1, refuse a new dispatch if too many machines are already running.
5. **`ai-gateway` egress.** The worker calls the Vercel AI Gateway from Fly — confirm the gateway key works from a non-Vercel origin and that there's no IP allowlist. (It's an HTTPS API, so this should be fine.)
6. **Image freshness.** Prod pins `FLY_PIPELINE_IMAGE` to a `<sha>`; make the build pipeline update that Vercel env (or re-deploy) so a code change actually reaches dispatched machines — the same "stale image" trap called out in the GCP doc.

---

## Files this plan touches

New files:
- `apps/vizf1/worker/Dockerfile` — lightweight Node worker image
- `apps/vizf1/worker/fly.toml` — Fly app config (no http service)
- `packages/content-source/src/flyDispatch.ts` — `runFlyMachine` helper (Fly analog of `cloudRunDispatch.ts`)
- `.github/workflows/build-vizf1-pipeline-image.yml` — build + `flyctl deploy` on push to `main`

Existing files modified:
- `apps/admin/app/api/vizf1/runs/route.ts` — flag-gated `gha|fly` dispatch (from the integration plan)
- `apps/vizf1/worker/package.json` — add `pipeline:run` / `pipeline:run:ci` scripts
- `packages/content-source/src/story... ` (no change needed; the render dispatchers stay on their own backend flag)

Kept on GitHub Actions:
- `.github/workflows/vizf1-ingest-news.yml`, `.github/workflows/vizf1-race-weekend.yml` — ingest cron
- `.github/workflows/vizf1-ai-pipeline.yml` — retained as the `PIPELINE_BACKEND=gha` fallback during rollout
