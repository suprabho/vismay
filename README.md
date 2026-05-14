# Vizmaya

A data-driven visual storytelling platform that pairs scroll-synced maps, charts, and prose to narrate complex geopolitical and market stories.

Built with **Next.js 16**, **Mapbox GL**, **Apache ECharts**, **GSAP ScrollTrigger**, and **Supabase**.

> **Editing stories, share cards, reports, autoplay videos, or demos? → See [instructions.md](./instructions.md).**

---

## How it works

Each story is a full-viewport scroll-snap experience with three persistent layers:

1. **Map background** (Mapbox GL) — flies between coordinates as the reader scrolls.
2. **Foreground chart** (ECharts) — transitions between data steps without remounting.
3. **Text cards** — snap-locked prose that drives both layers via IntersectionObserver.

Stories are authored as **Markdown + YAML config + chart JSON**, statically generated at build time, and editable through an admin UI (`/admin`). Content lives either on disk or in Supabase, switched by `CONTENT_SOURCE=fs|db`.

For deeper architecture context see [CLAUDE.md](CLAUDE.md) and [docs/db-backed-content-plan.md](docs/db-backed-content-plan.md).

---

## Project structure

```
app/                # Next.js routes (story pages, admin UI, API)
components/         # React components (story renderer, charts, admin editor, share)
content/
  stories/
    <slug>.md            # Story prose + frontmatter
    <slug>.config.yaml   # Map states, chart steps, scroll units
    <slug>.share.yaml    # Social card definitions
    <slug>.report.yaml   # Report/slides PDF overrides
    <slug>.tts.yaml      # Optional TTS narration overrides
    <slug>/charts/*.json # Chart data (served at runtime)
lib/                # Content loaders, render pipelines, helpers
scripts/            # CLI utilities (audio gen, data ingestion, migrations)
supabase/migrations # SQL migrations
```

---

## Tech stack

| Category | Tool |
|----------|------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, PostCSS |
| Maps | Mapbox GL JS |
| Charts | Apache ECharts |
| Animations | GSAP (ScrollTrigger), Rive |
| Backend | Supabase (Postgres + Storage + Auth) |
| Rendering | Playwright (PDF/video), ffmpeg (video mux) |
| TTS | Gemini API |
| Analytics | Vercel Analytics, Google Analytics |

---

## Getting started

```bash
# Install
npm install

# Configure env
cp .env.example .env.local
# Required: NEXT_PUBLIC_MAPBOX_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

# Dev server
npm run dev

# Production build
npm run build
```

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Yes | Mapbox GL rendering |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Database connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Server-side Supabase operations |
| `CONTENT_SOURCE` | No | `fs` (default, local files) or `db` (Supabase) |
| `GEMINI_API_KEY` | No | TTS audio generation |
| `GITHUB_DISPATCH_TOKEN` | Prod | Fine-grained PAT for render dispatch (Actions: write) |
| `GITHUB_DISPATCH_REPO` | Prod | `owner/repo` for the dispatch target |
| `GITHUB_DISPATCH_REF` | No | Branch the workflow runs from (defaults to `main`) |
| `NEXT_PUBLIC_GA_ID` | No | Google Analytics |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Static generation build |
| `npm run start` | Production server |
| `npm run lint` | ESLint checks |
| `npm run generate-audio` | Generate TTS audio via Gemini API |
| `npm run migrate-content` | Sync filesystem stories into Supabase |
| `npm run energy-profile:scrape` | Scrape IEA-related news for `/energy-profile` |
| `npm run energy-profile:import-owid` | Import OWID country energy data |

---

## Render pipelines

Three async pipelines run via GitHub Actions in production and sync in local dev:

| Pipeline | Endpoint | Workflow | Notes |
|----------|----------|----------|-------|
| Autoplay video (MP4) | `/api/story-video/[slug]?aspect=9:16\|16:9` | [render-video.yml](.github/workflows/render-video.yml) | Needs Playwright + ffmpeg |
| Story PDF (report/slides) | `/api/story-pdf/[slug]?format=report\|slides` | [render-pdf.yml](.github/workflows/render-pdf.yml) | Chromium only |
| TTS audio | (regen button in admin) | [render-audio.yml](.github/workflows/render-audio.yml) | Needs `GEMINI_API_KEY` |

All three follow the same `{ status: 'ready' \| 'rendering', public_url? }` poll shape. See [CLAUDE.md](CLAUDE.md) for required GitHub repo secrets and Vercel env vars. For how to trigger each from the admin UI, see [instructions.md](./instructions.md).

---

## Further reading

- [instructions.md](./instructions.md) — admin/editor guide
- [CLAUDE.md](CLAUDE.md) — codebase context, deploy requirements, active initiatives
- [docs/db-backed-content-plan.md](docs/db-backed-content-plan.md) — Supabase content cutover plan
- [docs/share-card-doctor-plan.md](docs/share-card-doctor-plan.md) — share-card system design
