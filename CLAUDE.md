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

## Deployment requirements

The autoplay video render path (`scripts/generate-video.ts`, `app/api/story-video/[slug]/route.ts`, `lib/storyVideoRender.ts`) shells out to a real headless Chromium and to `ffmpeg`. Anywhere this is expected to work — local dev, CI, the prod runtime that serves the API route — needs both:

- **`ffmpeg` on PATH** (`brew install ffmpeg` locally; install via system package manager on the deploy host).
- **Playwright Chromium installed** (`npx playwright install chromium`). This is *not* automated via a `postinstall` script because it would also fire on Vercel-style serverless builds where the binary doesn't run anyway.

Vercel default runtime can't host this — Playwright needs a real Chromium and `maxDuration` of up to 300s. If you move the API route to a separate worker (Fly.io / Railway / a long-running Node service), make sure that environment has both prerequisites. The renderer fails fast with a clear message if either is missing.
