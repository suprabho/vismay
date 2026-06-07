# Plan: Compose a story from sources (staged, in-canvas)

> **⚠️ RECONCILED 2026-06-07 — read this first.** This doc was written as if
> greenfield, but a *different* first cut shipped in the meantime: a standalone,
> **filesystem-backed** composer (`packages/story-pipeline` + the
> `/vizmaya/compose` `ComposePanel`) that this doc never mentions. The approved,
> up-to-date execution plan — which treats the work as a **cutover** of that fs
> composer onto this canvas/DB design, in independently-shippable phases A–H — is
> tracked separately and supersedes the phase/file lists below where they
> conflict. The staged UX, data model, and route shapes below remain the target.
>
> Corrections to the original text that follow:
> - **Migration number is 056, not 054.** 054 (`admin_profiles`) and 055 are
>   taken; 056 is the next free slot.
> - **The `pdf-parse → DOMMatrix` premise is stale.** `pdf-parse` 2.x works today
>   in `packages/story-pipeline/src/ingest/extract.ts`. Gemini multimodal
>   extraction is an **upgrade for scanned PDFs/images**, not a fix for a broken
>   path — keep pdf-parse as the fast default and add multimodal as a per-source
>   fallback/re-extract (do **not** "retire pdf-parse entirely").
> - **Most "reuse" primitives already exist and are shipped** (canvas,
>   `generate-section` + refine loop, `dbSource`, the PUT save path,
>   `recordGeneration`, the Assets image-gen path). The real work is reconciling
>   the shipped fs composer with them, not building from scratch.
> - **There are two section generators today** (`story-pipeline`'s and the canvas
>   `generate-section` route's) sharing only `sectionBodySchema`. Phase A
>   canonicalizes on the package and shrinks the route to a delegating adapter.

## Context

"Compose a story from sources" lets an author paste links + drop files (PDFs,
emails, HTML), have the agent research them, then write a Deck or mapStory
**section by section**, regenerating any section. The first (in-canvas) attempt
conflated *narrative* with *visuals*, so there was nowhere to correct course
mid-draft; a later standalone fs cut got the staged narrative/research right but
sits outside the canvas and persists to disk. This plan converges them.

This plan breaks the flow into **review-gated stages**, each independently
accept / reject / refine-able, so the author steers at every step instead of
judging one finished artifact:

```
upload → extract → draft story
      → select angle(s)
      → outline (per-section: heading + intent + kind)        ← accept/reject/refine/reorder
      → CONTENT pass  (per-section markdown: heading + prose)  ← accept/reject/refine
      → VISUAL pass   (per-section config.yaml body)           ← accept/reject/refine
      → ASSETS        (chart JSON, generated images)           ← per-asset refine
```

### Decisions (from the user)

1. **Draft state** = reuse the existing `stories` row + **one new table**. Angles
   and the outline live in a JSONB column on `stories` (`compose_state`); raw
   extracted source text lives in a `story_sources` table. No separate
   `story_drafts` entity. This **replaces** the shipped fs composer's
   `.compose/<id>.json` session store (the session id collapses into the slug).
2. **Extraction** = `pdf-parse` 2.x fast path (already working) **+ Gemini
   multimodal via `@vismay/ai-gateway` as a per-source fallback** for scanned
   PDFs/images (and the re-extract target for `story_sources.status='failed'`
   rows). Multimodal sends bytes straight to the model; no DOM dependency.
3. **UI surface** = **all inside the canvas**. No separate wizard — the front
   stages are canvas nodes feeding the existing `FrameNode`, so the whole pipeline
   shares the canvas's save/merge/render plumbing. Review happens primarily in the
   canvas, with the markdown editor (`/vizmaya/<slug>`) and the public page kept
   as secondary links.

---

## What already exists (reuse — do NOT reinvent)

| Need | Reuse |
|---|---|
| Per-section generate **with refine loop** | [`generate-section/route.ts`](../apps/admin/app/api/vizmaya/stories/[slug]/canvas/generate-section/route.ts) — already returns `heading`+`paragraphs`+`body` and folds `feedback`+`previous` to revise a prior draft |
| Structured visual body | `sectionBodySchema`, `normalizeSectionBody`, `GEN_FOREGROUND_TYPES` from `@vismay/viz-engine` — the model fills typed JSON, can't emit broken YAML |
| Slot generate (text + image) | [`canvas/generate/route.ts`](../apps/admin/app/api/vizmaya/stories/[slug]/canvas/generate/route.ts) + `aiSlots.ts` + `<PromptBar>` (canvas-ai-integration-plan) |
| Evaluator (critique → route) | [`canvas/evaluate/route.ts`](../apps/admin/app/api/vizmaya/stories/[slug]/canvas/evaluate/route.ts) |
| Section insertion primitive | `appendStorySection(markdown, configYaml, section)` in `packages/content-source/src/storySection.ts` |
| Text/image gen + audit | `@vismay/ai-gateway`: `generateText({model,system,prompt,schema})`, `generateImage`, `recordGeneration`, `hashRequest`; audit table `ai_generations` (migration 043) |
| Per-feature model pick | `getFeatureModel(...)` (`lib/aiModelSettings.ts`, migration 052) |
| Save / reload | `saveMarkdown`, `saveConfigYaml` (PUT `/api/vizmaya/stories/<slug>`) → `dataNonce` bump → iframe reload |

**Key insight:** the back half (stages CONTENT/VISUAL/ASSETS) is mostly
`generate-section` + the canvas-ai-integration plumbing. The work is (1) **splitting
`generate-section` into a content pass and a visual pass**, and (2) building the
**three new front stages** (sources, angles, outline) as canvas nodes.

---

## Hard constraint to honor

The canvas **hard-requires a `config.yaml` with ≥1 section** —
`apps/admin/app/vizmaya/[slug]/canvas/page.tsx` calls `hasStoryConfig(slug)` then
`notFound()`, and renders sections via `loadStoryConfig`/`resolveUnits`. So a
compose draft **must be created with a seeded minimal `config.yaml` + a markdown
heading before the canvas opens** (same rule the online-content-migration plan hit
for create/import). The outline stage replaces that placeholder section with real
ones via `appendStorySection`.

---

## Data model (migration **056**)

`supabase/vizmaya-fyi/migrations/056_compose_from_sources.sql`:

1. **`stories.compose_state jsonb`** (nullable). The whole pipeline scaffold for a
   draft, set/cleared as authoring proceeds. Shape:
   ```jsonc
   {
     "phase": "sources|angles|outline|content|visual|done",
     "format": "deck|map",
     "angles": [ { "id": "a1", "title": "...", "thesis": "...", "rationale": "..." } ],
     "chosenAngleId": "a1",
     "outline": [
       { "id": "s1", "heading": "...", "intent": "...", "kind": "stat",
         "status": "pending|accepted|rejected", "sectionId": null }   // sectionId set once materialized
     ]
   }
   ```
   Non-published scaffolding on the published row is acceptable (the consumer
   ignores unknown columns); it is cleared (`null`) when the author finishes or
   abandons compose.

2. **`story_sources`** — one row per uploaded file / pasted link:
   ```
   id uuid pk
   story_slug text   → stories.slug (fk, on delete cascade)
   kind text         'file' | 'link'
   filename text     null for links
   storage_path text path in story-sources bucket (null for links)
   source_url text   for links (null for files)
   mime text
   title text        extracted title
   byline text       extracted byline (nullable)
   extracted_text text
   status text       'pending' | 'extracted' | 'failed'
   error text
   created_at timestamptz default now()
   ```
   Indexed on `story_slug`. RLS: service-role only (admin routes), matching
   existing tables.

3. **`story-sources` storage bucket** (private) for uploaded source files —
   mirrors the `story-assets` bucket setup (migration 037). Originals are retained
   so extraction can be re-run with a better model later.

---

## Routes (all under the existing canvas API tree)

### 0. Create the draft — `POST /api/vizmaya/stories/compose`
- `isAuthed()`; body `{ title, format: 'deck'|'map', appSlug? }`.
- Canonical slug from title (`^[a-z0-9-]+$`, collision → 409).
- Seed minimal markdown (frontmatter + one `## ` heading) + minimal valid
  `config.yaml` (one section, passes `loadStoryConfig`) — **writes ordered
  `writeMarkdown` first** (creates the row), then `writeConfigYaml`. Set
  `status: published, listed: false` (the canvas/live-preview convention).
- Initialise `compose_state = { phase: 'sources', format, angles: [], outline: [] }`.
- Return `{ ok, slug }`; client redirects to `/vizmaya/<slug>/canvas`.

### 1. Add + extract a source — `POST /api/vizmaya/stories/[slug]/canvas/compose/sources`
- Accepts `multipart/form-data` (a `file`) **or** JSON `{ url }`.
- File → upload to `story-sources` bucket; insert `story_sources` row (`pending`).
  Link → fetch server-side (size/host caps), insert row.
- **Extract**: PDFs/images → send bytes to a Gemini multimodal model via
  `generateText` (multimodal input) asking for `{ title, byline?, body }`; HTML/text
  → readability-style strip then the same normalising call. Persist `title`,
  `byline`, `extracted_text`, `status='extracted'` (or `'failed'` + `error`).
- `recordGeneration({ kind:'text', ... })` for audit.
- `GET` sibling lists sources for the slug (node hydration on canvas load).

### 2. Generate angles — `POST .../canvas/compose/angles`
- Reads all `extracted` sources for the slug, concatenates (capped) into context.
- `generateText({ schema: AnglesSchema })` → `{ angles: [{title, thesis, rationale}] }`
  (3–5). Persist into `compose_state.angles`, set `phase='angles'`.
- Refine loop (`feedback`+`previous`) like `generate-section` so the author can ask
  for different framings.

### 3. Generate / refine outline — `POST .../canvas/compose/outline`
- Body `{ chosenAngleId, feedback?, previous? }`.
- `generateText({ schema: OutlineSchema })` → ordered `[{heading, intent, kind}]`
  grounded in the chosen angle + sources. Persist `compose_state.outline`
  (status `pending`), `chosenAngleId`, `phase='outline'`.
- Accept/reject/refine/reorder happen client-side against `compose_state`; a small
  `PATCH` persists edits. **Accepting the outline materializes sections**: for each
  accepted entry call `appendStorySection` → markdown heading + config section →
  PUT save; record the new `sectionId` back into the outline entry; `phase='content'`.

### 4. Section generate — **split** `generate-section` into two phases
Refactor [`generate-section/route.ts`](../apps/admin/app/api/vizmaya/stories/[slug]/canvas/generate-section/route.ts)
to take `phase: 'content' | 'visual'` (default `'content'`; back-compat: a caller
wanting the old combined behavior can still get both, but compose drives them
separately):
- **`phase:'content'`** → schema `{ heading, paragraphs }` only. Grounded in the
  outline entry's `intent` + the chosen angle + sources. Writes markdown on accept.
  Keeps the existing `feedback`+`previous` refine loop. → your "refine each CONTENT".
- **`phase:'visual'`** → schema `{ body, chartSuggestions?, imageSuggestions? }`
  given the **already-accepted** `heading`+`paragraphs` as context, constrained by
  `sectionBodySchema`. Writes `config.yaml` body on accept. → your "refine each
  section (YAML)". `chartSuggestions`/`imageSuggestions` seed stage 5.

### 5. Assets — reuse existing
- Charts: a suggested chart → `chart_data` row + JSON (existing chart save path);
  refine the data/spec per chart.
- Images: `imageSuggestions` → existing `generate/route.ts` image modality →
  `story-assets` bucket → layer references the asset. Refine = regenerate.

Every generate call records to `ai_generations` (audit + the rating handle the
feedback UI already uses).

---

## Canvas UI (all inside the canvas)

New left-column input nodes feeding the `FrameNode`, plus the existing per-slot
`<PromptBar>` for the back half. Hydrate from `compose_state` + `story_sources` on
load so a reload resumes mid-pipeline.

- **`SourcesNode`** (`canvas/compose/SourcesNode.tsx`) — drag/drop files + a
  link input; lists each source with extraction status (pending/extracted/failed +
  re-extract). Posts to route 1.
- **`AngleNode`** — "Generate angles" → radio list of `compose_state.angles` with
  thesis/rationale; pick one; "Regenerate" with a refine note. Sets `chosenAngleId`.
- **`OutlineNode`** — "Generate outline" → ordered, editable section list
  (heading + intent + kind chip); per-row accept/reject, drag-reorder, inline
  refine; "Materialize accepted" → creates the real sections and advances to
  content. After this the `FrameNode` shows real sections rendering live.
- **CONTENT / VISUAL** per section reuse the canvas-ai-integration `<PromptBar>` on
  the content node and the visual slots, now backed by the split `generate-section`
  phases. The evaluator (`evaluate/route.ts`) critiques rendered sections and routes
  fixes back — unchanged.

A small **compose progress strip** (driven by `compose_state.phase`) shows where
the draft is and gates forward steps (can't outline before an angle is chosen).

### Entry point
Add a **"Compose from sources"** action on the admin homepage
(`apps/admin/app/page.tsx`, near `DraftsList`) — title + format + optional app →
POST route 0 → redirect into the canvas at `phase:'sources'`. (This is the first
homepage create affordance to ship, since `NewStoryPanel` from the
online-content-migration plan was never built.)

---

## Files

**New:**
`supabase/vizmaya-fyi/migrations/056_compose_from_sources.sql`,
`app/api/vizmaya/stories/compose/route.ts`,
`app/api/vizmaya/stories/[slug]/canvas/compose/sources/route.ts`,
`app/api/vizmaya/stories/[slug]/canvas/compose/angles/route.ts`,
`app/api/vizmaya/stories/[slug]/canvas/compose/outline/route.ts`,
`components/vizmaya/canvas/compose/{SourcesNode,AngleNode,OutlineNode}.tsx`,
the angle/outline Zod schemas, multimodal extraction fallback helper.
(Compose-state read/write lives in `packages/content-source`, alongside the
`story_sources` accessors — not a separate admin `lib/` helper.)

**Modify:**
`packages/story-pipeline/src/{generate,prompts,schema}.ts` (split section gen into
content/visual passes — the single canonical generator),
`app/api/vizmaya/stories/[slug]/canvas/generate-section/route.ts` (shrinks to a
delegating adapter that adds `phase` + auth/audit/model-pick),
`CanvasClient.tsx` (register compose nodes + wire to FrameNode + hydrate
compose_state), the `/vizmaya/compose` entry (create form → route 0 → redirect),
`packages/content-source` reader/writer for the new `compose_state` column +
`story_sources` accessors.

**Reuse unchanged:** `appendStorySection`, `generate`/`evaluate` routes, `aiSlots.ts`,
`<PromptBar>`, `@vismay/ai-gateway`, `sectionBodySchema`, asset/chart save paths.

**Cut over (fs → DB):** the shipped composer's `writeStoryFiles` + `.compose/<id>.json`
session store (`app/api/vizmaya/compose/shared.ts`) move to `dbSource` writes +
`compose_state`; the `compose/{generate,regenerate-section,sessions}` routes and
`ComposePanel.tsx` are retired once the canvas path is proven.

**Extraction:** keep `pdf-parse` as the fast default; add Gemini multimodal only as
a per-source fallback for scanned/image PDFs (NOT a wholesale retire of pdf-parse;
the `apps/vizmaya-fyi/scripts/ingest/extract.ts` ingest CLI is unaffected).

---

## Open decisions to resolve at build time

1. **Source context budget** — sources can exceed a model window. Options: cap +
   truncate per source, or a pre-pass that summarizes each source into the
   `story_sources` row before angles/outline. (Recommend cap first, summarize-pass
   as a follow-up if drafts feel thin.)
2. **Link fetching** — server-side fetch needs host/size/timeout guards and a
   readability strip. Decide allowed schemes + max bytes.
3. **Multimodal model alias** — which `MODELS.text` alias handles PDF/image bytes
   (must support multimodal input); wire it through `getFeatureModel('composeExtract')`.
4. **compose_state lifecycle** — when to clear it (on first publish? explicit
   "finish compose"?) so a finished story doesn't carry scaffold.

## Verification

- `pnpm --filter admin typecheck && pnpm --filter admin lint`; `pnpm build` (db mode).
- Manual E2E in admin canvas (CONTENT_SOURCE=db): create a compose draft → drop a
  PDF (e.g. the ITC one) → confirm `pdf-parse` extracts it (and that a scanned/image
  PDF falls back to multimodal) → generate angles → pick one → outline →
  accept/reorder → materialize → per-section CONTENT refine → VISUAL refine →
  confirm `config.yaml`/markdown persist and the frame re-renders → `stories` /
  `story_sources` / `ai_generations` rows written at each stage.
