# Vizmaya admin guide

This guide walks editors through the admin surfaces for stories: editing markdown and YAML, building share cards, generating reports, rendering autoplay videos, and managing client demos. UI flow first; technical notes are tucked at the bottom of each section as *Behind the scenes*.

> **Sign in:** open `/admin/login` and request a magic link. Supabase emails you a one-click link that drops you on `/admin`.

---

## 1. The story dashboard — `/admin`

The dashboard is the entry point. It lists every story with:

- **Status** — `draft`, `published`, or `archived`.
- **Listed** flag — whether the story shows in the public `/` listing.
- **Display order** — controls position on `/stories`.

Top-level tabs: **Stories** · **Demos** · **Epics**.

Click any row to open the per-story editor.

---

## 2. Editing a story — `/admin/[slug]`

The per-story editor has six tabs across the top. Cmd/Ctrl-S saves from anywhere.

### Theme
Pick the story's brand colors and fonts. Saved into the markdown frontmatter's `theme` block. Charts, maps, and text all read these as CSS variables (`--color-background`, `--color-accent`, etc.).

### Markdown
The full story prose plus YAML frontmatter (title, subtitle, byline, colors, status, listed flag, display order). The textarea accepts tab-indent and Cmd/Ctrl-S to save. Save calls `PUT /api/admin/stories/[slug]`.

### Config (YAML)
The structural file — usually 550–750 lines. Defines:

- **Sections** → one map state each (center, zoom, pitch, bearing, pins, opacity).
- **Subsections** → chart steps that advance while the map holds.
- **Text references** → heading strings that link config sections to markdown.

Edit carefully: a broken YAML here breaks the whole story render. The cards view (toggleable) makes navigation easier than scrolling raw YAML.

### Charts
A list of every chart ID the story references. Two flavors:

- **Editable JSON charts** — click to open `/admin/[slug]/charts/[id]` and edit the JSON directly.
- **Hardcoded React charts** — shown as read-only references; the data lives in code (`components/story/charts/*.tsx`).

### Narration
See [§5 Autoplay videos](#5-autoplay-videos) and [§6 TTS narration](#6-tts-narration-audio). This tab covers both because the autoplay render uses TTS output.

### Settings
Quick toggles for status, listed flag, and display order. Stored in the markdown frontmatter — same fields as the Markdown tab, just surfaced with a UI.

*Behind the scenes:* the editor reads and writes through [lib/contentSource.ts](lib/contentSource.ts). With `CONTENT_SOURCE=fs` (local dev), saves write to `content/stories/<slug>.*`. With `CONTENT_SOURCE=db` (production), saves go to Supabase. Same call sites either way. Editor entry: [components/admin/EditorClient.tsx](components/admin/EditorClient.tsx).

---

## 3. Share cards — `/story/[slug]/share`

Share cards are the social previews and the in-app share gallery.

1. Visit `/story/<slug>/share` while signed in as an admin (non-admins see the gallery read-only).
2. The page renders every card variant. Hit the edit icon on any card to open the **share edit drawer**.
3. Use the **aspect picker** to choose 1:1, 3:4, or 4:3.
4. Use the **map picker** to drop pins, set bounds, and pick the focus area per aspect.
5. The right-hand pane has the **YAML editor** — overrides and per-card configuration live here.
6. **Save** writes `share_yaml` via `PUT /api/admin/stories/[slug]`.

The same YAML drives Twitter / Open Graph cards and the share modal a reader sees on `/story/[slug]`.

*Behind the scenes:* schema lives in `<slug>.share.yaml`. Page entry: [app/story/[slug]/share/page.tsx](app/story/[slug]/share/page.tsx). Shell: [components/share/ShareShell.tsx](components/share/ShareShell.tsx). Drawer: [components/share/ShareEditDrawer.tsx](components/share/ShareEditDrawer.tsx).

---

## 4. Report builder — `/reports/[slug]`

The report builder controls the PDF layout. Each "page" in the report maps to a Playwright capture during render.

1. Open `/reports/[slug]`.
2. For every page you see:
   - **Skip / include** toggle — drop the page from the PDF without losing its config.
   - **Heading**, **subheading**, **paragraphs** — override the on-page text without touching the story markdown.
   - **Chart override** — swap which chart renders on that page (optional).
3. **Save** writes to `stories.report_yaml` (DB) or `<slug>.report.yaml` (file).

### Downloading the PDF

From `/admin/[slug]`'s sidebar, hit **Report PDF** or **Slides PDF**:

- The button calls `GET /api/story-pdf/[slug]?format=report` (letter portrait) or `?format=slides` (1920×1080 deck).
- First response is `{ status: 'rendering' }`. The UI polls until `{ status: 'ready', public_url }` and gives you the download.
- Re-clicking after a successful render hits the cache instantly.

*Behind the scenes:* cache key is `(slug, format, content_revision_hash)`. The hash is a sha256 over markdown + every YAML + every chart JSON for the slug — so code-only redeploys don't bust cache, but any content edit does. Production dispatches `.github/workflows/render-pdf.yml`. See [lib/storyPdf.ts](lib/storyPdf.ts).

---

## 5. Autoplay videos

There are two surfaces:

### Preview the autoplay — `/story/[slug]/autoplay`
Plays the autoplay sequence (map flies, chart advances, narration plays) in the browser. Useful for QA-ing pacing before committing to a render. Also exposes inline narration / map editing.

### Render an MP4 — `/admin/[slug]` → Narration tab
Two buttons:

- **9:16** (vertical, for Reels / TikTok / Shorts)
- **16:9** (horizontal, for landscape video)

Clicking either:

1. Calls `POST /api/story-video/[slug]?aspect=9:16` (or `16:9`).
2. Returns `{ status: 'rendering' }` and starts polling.
3. When the workflow finishes, returns `{ status: 'ready', public_url }` and offers a download.

Aspect notes:

- `9:16` renders at viewport 646×1136 and upscales to 1080×1920.
- `16:9` renders at viewport 1920×1080.

*Behind the scenes:* production dispatches `.github/workflows/render-video.yml`. Local runs invoke Playwright + ffmpeg in-process via [lib/storyVideoRender.ts](lib/storyVideoRender.ts) — you need `ffmpeg` on PATH (`brew install ffmpeg`) and Playwright Chromium (`npx playwright install chromium`). Required GitHub repo secrets and Vercel env vars are documented in [CLAUDE.md](CLAUDE.md).

---

## 6. TTS narration (audio)

The Narration tab in `/admin/[slug]` is where you fine-tune what the autoplay video says out loud.

1. The tab shows every mobile unit (identified by `parentIndex`, `subIndex`, `sliceIndex`) with:
   - The **default spoken text** derived from heading + paragraphs.
   - An **override textarea** — type here to change what gets spoken without editing the displayed markdown.
2. **Save** persists to `stories.tts_yaml` / `<slug>.tts.yaml`.
3. **Regenerate audio** kicks off rendering:
   - In production: fires `.github/workflows/render-audio.yml` (needs `GEMINI_API_KEY` in repo secrets).
   - Locally: if dispatch envs aren't set, the button returns a hint to run `npx tsx scripts/generate-audio.ts <slug> --force` from your terminal.

Methodology units listed in `TTS_SKIP_IDS` (see [lib/storyTts.ts](lib/storyTts.ts)) are intentionally silent; their override input is disabled.

*Behind the scenes:* the audio chunk hash includes any override text, so only edited chunks regenerate on save. Generated audio gets muxed into autoplay video renders automatically.

---

## 7. Demos — `/admin/demos`

Demos are **private, password-gated client previews** of a story. They let you ship a tailored version (with custom share-card curation and content overlays) without changing the public story.

1. From `/admin/demos`, create a new demo or open an existing one.
2. The editor at `/admin/demos/[id]` has three tabs:

### Settings
- **Client name** + **URL slug** (lives at `/demo/<clientSlug>`).
- **Parent story** — which story this demo wraps.
- **Status** — `draft`, `published`, or `archived`. Archived blocks public access.
- **Password** — what the client types on the login gate.

### Content
A demo-specific YAML overlay that layers on top of the parent story's config (text swaps, hidden sections, etc.). The parent story stays unchanged.

### Share assets
Curate which share-card variants from the parent story appear in this demo's share gallery. Pick from the variants defined in the parent's `<slug>.share.yaml`.

### Sharing with the client
- Public URL: `/demo/<clientSlug>`.
- Non-admins land on `/demo/<clientSlug>/login` and enter the password.
- Admins bypass the gate automatically via the admin auth cookie.

*Behind the scenes:* demos persist `share_card_ids` as an array referencing entries in the parent's share YAML by `parentIndex`, `subIndex`, `sliceIndex`, and `variant`. Editor: [components/admin/DemoEditorClient.tsx](components/admin/DemoEditorClient.tsx).

---

## 8. Common questions

**My edit didn't go live in production.**
ISR revalidates on save. If you don't see the change after a minute, open `/admin/[slug]` → Settings and confirm the story is `published` (not `draft`). Listed = false means it won't appear on `/` even when published.

**A render button just spins forever.**
Production renders are GitHub `workflow_dispatch` calls. Open the repo's **Actions** tab and look for failures in `render-video.yml`, `render-pdf.yml`, or `render-audio.yml`. Locally, check the dev server console for missing `ffmpeg` or Playwright errors.

**Where do the source files actually live?**
During the DB-backed content cutover, `content/stories/` stays in git as a backup. Edits go to whichever source `CONTENT_SOURCE` selects (file in dev, DB in prod). When in doubt, check `git status` after a save to see whether it touched disk.

**I broke the YAML and the story won't load.**
The Config tab's editor surfaces parser errors inline. Revert to the last good version from git (`git diff content/stories/<slug>.config.yaml`) or restore the previous save through the editor's undo.

**Who can sign in?**
Anyone with their email allow-listed in Supabase Auth. Adding a new admin is a Supabase Auth admin task, not something you do through this UI.
