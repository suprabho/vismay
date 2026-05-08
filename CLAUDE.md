# Claude context for vizmaya-fyi

## Active initiative: DB-backed content

Branch `feat/db-backed-content` is migrating story content (markdown + yaml + chart JSON) from the filesystem into Supabase Postgres so edits can go live without redeploying code.

**Plan + phase breakdown:** [docs/db-backed-content-plan.md](docs/db-backed-content-plan.md) — read this before making changes in this area.

Key points:
- Storage is **blob, not normalized** — one row per story with raw md/yaml as text columns. Keeps `gray-matter` / `yaml.parse` unchanged.
- Supabase is already wired (`lib/supabase.ts`, migrations 001–004). Next migration: 005.
- Readers route through `lib/contentSource.ts` (to be built) with `CONTENT_SOURCE=fs|db` env var — preserves local dev loop on `fs`.
- Files in `content/stories/` stay in git as backup during cutover.

## Content structure (current)

Per story in `content/stories/`:
- `<slug>.md` — prose + YAML frontmatter
- `<slug>.config.yaml` — map/scroll/chart config (550–750 lines)
- `<slug>.share.yaml` — social card definitions
- `<slug>/charts/*.json` — chart data served at runtime by `app/api/chart-data/[slug]/[id]/route.ts`

Readers: `lib/content.ts`, `lib/storyConfig.ts`. Rendering: SSG via `generateStaticParams` in `app/story/[slug]/page.tsx`.

## Autoplay video render

`/api/story-video/[slug]?aspect=9:16|16:9` produces a downloadable MP4 of an autoplay session. It has two execution modes that share one polling-friendly response shape (`{ status: 'ready' | 'rendering', public_url? }`):

- **Sync mode** (local dev): the route runs `lib/storyVideoRender.ts` in-process. Needs `ffmpeg` on PATH (`brew install ffmpeg`) and Playwright Chromium (`npx playwright install chromium`). Request blocks for ~real-time playback.
- **Dispatch mode** (production): when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set, the route fires a `workflow_dispatch` to `.github/workflows/render-video.yml` and returns 202. The Actions runner does the render and uploads to the `story-video` bucket; the UI polls the same endpoint until the cached row appears.

**Vercel env vars** (production):
- `GITHUB_DISPATCH_TOKEN` — fine-grained PAT with `Actions: write` on this repo
- `GITHUB_DISPATCH_REPO` — `owner/repo` (e.g. `suprabho/vizmaya-fyi`)
- `GITHUB_DISPATCH_REF` — branch the workflow runs from (defaults to `main`)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — already required for other paths

**GitHub repo secrets** (the workflow itself needs these):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`

Vercel default runtime can't host the sync path — Playwright needs a real Chromium and ffmpeg has to be on PATH, neither of which the serverless runtime provides. The dispatch path works around this without standing up a dedicated worker. If volume grows to where Actions minutes are a concern, the `renderStoryVideo` function is the seam for moving to Fly.io / Railway / a Node service — only the dispatch wiring would change.

## Story PDF render (report + slides)

`/api/story-pdf/[slug]?format=report|slides` produces a downloadable PDF. Same dispatch-or-sync split as the video pipeline; cheaper because the render needs only Chromium (no ffmpeg, no audio).

- **Routes Playwright screenshots:** `/story/[slug]/report` (letter portrait booklet) and `/story/[slug]/slides` (1920×1080 16:9 deck). Both accept `?print=1` to strip dev-preview chrome.
- **Render entry:** `lib/storyPdfRender.ts` → `renderStoryPdf({slug, format, baseUrl, force})`. Waits on `window.__pdfReady__` (set by the readiness coordinator in [lib/pdfReadiness.ts](lib/pdfReadiness.ts) once all maps fire `onReady` plus a short ECharts settle window).
- **Cache key:** `(slug, format, content_revision_hash)` where the hash is sha256 over markdown + config.yaml + share.yaml + report.yaml + every chart JSON for the slug. Implementation: [lib/storyPdf.ts](lib/storyPdf.ts).
- **Dispatch:** `lib/storyPdfDispatch.ts` fires `.github/workflows/render-pdf.yml` when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set. Same env vars as video.
- **Per-story override config:** `content/stories/<slug>.report.yaml` (also `stories.report_yaml` in the DB after migration 010). Edited via the `/reports/[slug]` builder (referer-gated; dev mode allows direct nav). Schema: skip/include + heading/subheading/paragraphs + per-page chart override. See [lib/storyReportConfig.ts](lib/storyReportConfig.ts).

**Deploy requirements** (in addition to the video ones above):
- Apply migration `010_story_pdfs.sql` — adds the `story_pdfs` table, the `story-pdf` bucket, and the `report_yaml` column on `stories`.
- No new env vars; the dispatch path reuses `GITHUB_DISPATCH_TOKEN` / `GITHUB_DISPATCH_REPO` / `GITHUB_DISPATCH_REF`.
- Same GitHub repo secrets as the video workflow (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`).
