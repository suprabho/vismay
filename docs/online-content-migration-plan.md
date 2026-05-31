# Move Vismay content authoring fully online (DB-only + homepage upload/create)

## Context

Today, story content lives as ~212 files in `apps/vizmaya-fyi/content/stories/` (34 stories) and is pushed into Supabase by a script: `sync-fs-to-db.ts` (a `prebuild` hook) and `migrate-content-to-db.ts` (one-shot), via `lib/syncToDb.ts`. The reader layer `packages/content-source/src/contentSource.ts` switches between `fs` and `db` on the `CONTENT_SOURCE` env var (default `fs`).

The user wants to **stop committing content files + running a migration script** and instead author entirely online: Supabase becomes the only source of truth, and the admin homepage gains a way to **upload existing content** and **create new stories**, both landing directly in the existing Rete **canvas** editor. (Deeper canvas + AI authoring — "draft a story from a brief", in‑canvas AI assist — is intentionally deferred to a follow‑up; see end.)

This plan covers **Part 1 (remove fs path + files → DB‑only)** and **Part 2 (homepage upload + create → canvas)**.

## Decisions (from the user)

- **New stories** are created `status: published, listed: false` ("publish unlisted") so the canvas and its live‑preview iframes render in production. *Accepted tradeoff:* the story URL is publicly reachable by anyone with the link. (Follow‑up option to harden: allow authed/signed admin draft preview instead.)
- **PDF‑ingest** (`ingest-source.ts`) and the one‑shot `migrate-hero-split.ts` are **retired** (deleted). PDF ingest may return later via the AI "draft from brief" work.
- **Bundle format** = a single **`.zip`** of one story's files, unzipped server‑side with **`fflate`** (tiny, zero‑dep; no zip lib exists today). No Zod (not a dependency) — reuse the existing hand‑rolled validators.

## Key constraints discovered (must‑honor)

1. **The canvas hard‑requires a `config.yaml`.** `apps/admin/app/vizmaya/[slug]/canvas/page.tsx:29` does `if (!(await hasStoryConfig(slug))) notFound()`, then `loadStoryConfig`/`resolveUnits` over sections. **Create + import must seed a minimal valid `config.yaml` (≥1 section) and markdown with ≥1 heading**, or the canvas 404s.
2. **`writeMarkdown` must run first.** In `dbSource`, `writeMarkdown` upserts the row; `writeConfigYaml`/`writeShareYaml`/`writeReportYaml`/`writeTtsYaml`/`writeMapYaml` are **UPDATE‑only** and silently no‑op if the row doesn't exist yet.
3. **The migration mapping is incomplete.** `lib/syncToDb.ts` only writes `title,status,listed,aura,markdown,config_yaml,share_yaml` + charts — **not** `report_yaml`, `tts_yaml`, `map_yaml`, `app_slug`, or `display_order`. These must be added to a shared mapping and gap‑filled in the DB **before** any file deletion, or per‑story report/narration/map overrides and grid visibility (app_slug) can be lost.
4. **DB‑only build needs Supabase env at build time.** Consumer SSG (`generateStaticParams` in `app/story/[slug]/page.tsx`, `autoplay`, `opengraph-image`, `twitter-image`, `sitemap.ts`, home) reads the content source at build. Already in `turbo.json` `build.env` and on Vercel; after removal, a build with no Supabase creds **hard‑fails** (previously degraded to fs). Document this.
5. **No test suite exists** (no runner, no `*.test.*`). Verification = `pnpm typecheck` + `pnpm lint` + `pnpm build` (db mode) + manual E2E. Do not claim test coverage.
6. Content lives **only** in `apps/vizmaya-fyi/content/`. `footshorts`/`vizf1` are workspace globs that don't read story content; `catalog` doesn't either. (Root `vizmaya-data/` + `vizmaya-data.zip` are raw ingest source — leave alone.)

## Rollout order (each phase independently revertible; files deleted LAST)

**A → B → C → D**, with B and D as hard GO/NO‑GO gates.

---

### Phase A — Extract shared mapping (no behavior change)

Create `packages/content-source/src/storyMapping.ts` (pure, **no `fs`/IO**), exported via the package `exports` map as `"./storyMapping"`:
- `parseFrontmatterColumns(md)` → `{ title, status, listed, aura }` (the logic duplicated in `contentSource.writeMarkdown` and `syncToDb.syncStory`).
- Move `VERTICAL_TO_APP_SLUG` + `deriveAppSlugFromFrontmatter` here (currently `contentSource.ts:64‑77`).
- `interface StoryBundle { slug; markdown; configYaml?; shareYaml?; reportYaml?; ttsYaml?; mapYaml?; charts?: {chartId,data}[] }`.
- `bundleToStoryRow(b)` → full row **including** `report_yaml, tts_yaml, map_yaml, app_slug, display_order` (closes constraint #3).
- `bundleToChartRows(b)`, `chartIdFromFilename(name)`.

Re‑point `lib/syncToDb.ts` to build rows via the helper (keep its fs reads + Supabase upsert) **and extend it to read `<slug>.report.yaml`/`.tts.yaml`/`.map.yaml`** so the migration carries them. Optionally have `contentSource.writeMarkdown` reuse `parseFrontmatterColumns`.

**Checkpoint A:** `pnpm typecheck && pnpm lint` clean; `pnpm --filter vizmaya-fyi migrate-content -- --dry-run` lists all 34 slugs.

### Phase B — Migrate + verify parity (files still present) — GO/NO‑GO

1. **Backup:** git tag `pre-db-only-cutover`; write a small read‑only export of `stories` + `chart_data` to an out‑of‑repo JSON artifact; content also remains in git.
2. **Final seed (insert‑only, NEVER `--force`):** from `apps/vizmaya-fyi/` with prod Supabase env → `CONTENT_SOURCE=db pnpm migrate-content`. `--force` is forbidden (overwrites admin edits — DB is already source of truth).
3. **Gap‑fill the missing columns** for rows already in the DB (insert‑only won't touch them): for each fs slug where a DB override column is **NULL** and the file has content, fill it via the UPDATE‑only writers (`writeReportYaml`/`writeTtsYaml`/`writeMapYaml`) and set `app_slug`/`display_order` via `updateMetadata`. **Only fill NULLs — never overwrite a non‑null DB value.**
4. **Exclude `_demo-*` scaffolds** from the public catalog (don't seed/list them in prod).

**Checkpoint B (hard stop):** `stories` count == non‑demo `.md` count; `chart_data` count == on‑disk chart JSON count; `app_slug` non‑null for every story expected on a grid; spot‑check 3 stories byte‑for‑byte incl. report/tts/map; consumer renders identically in `fs` vs `db` for one map story, one chart story, one report story.

### Phase C — Ship homepage upload/create (db mode)

**Shared validation:** new `apps/admin/lib/storyValidation.ts` — move `validateMarkdown`/`validateYaml` out of `app/api/vizmaya/stories/[slug]/route.ts` and import them back there + into the new routes.

**Create‑blank — add `POST` to `apps/admin/app/api/vizmaya/stories/route.ts`** (keep `GET`):
- `isAuthed()` gate; body `{ slug, title, appSlug? }`.
- Validate `title` non‑empty; canonical slug `/^[a-z0-9-]+$/` (≤80); reject (don't silently slugify).
- Collision: `await src.readMarkdown(slug) != null` → 409.
- `appSlug` (if given): `SAFE_SLUG` + `getApp()` non‑null → else 400.
- Build minimal frontmatter md (`title`, `status: published`, `listed: false`, one `## ` heading) — serialize frontmatter with `gray-matter`/`yaml` (avoid quoting bugs). Validate with `validateMarkdown`.
- Seed starter `config.yaml` (one section, passes `loadStoryConfig`):
  ```yaml
  defaults: { mapStyle: mapbox://styles/mapbox/dark-v11, mapOpacity: 0.55 }
  sections:
    - { id: intro, text: "<title>", map: { center: [0, 20], zoom: 2 } }
  ```
  Validate with `validateYaml`.
- **Writes (ordered):** `writeMarkdown` (creates row; sets published + listed:false) → `writeConfigYaml` → `updateMetadata({ appSlug })` if given.
- `revalidatePath('/')`; return `{ ok, slug }`.

**Bundle import — new `apps/admin/app/api/vizmaya/stories/import/route.ts`:**
- `isAuthed()`; `req.formData()`; `file` = `.zip`, optional `overwrite`, `appSlug`. Size cap ~25 MB → 413.
- `fflate.unzipSync` → entries (ignore `__MACOSX`/dir prefixes). Require exactly one `*.md`; derive slug (prefer frontmatter `slug`/`app_slug`, else filename); canonicalize.
- **Validate everything before any write:** `validateMarkdown` (title), `validateYaml` each YAML, `JSON.parse` each `charts/*.json` → 400 naming the bad file.
- Collision: existing && !overwrite → 409.
- Build `StoryBundle`; **writes ordered** `writeMarkdown` → config/share/report/tts/map (present only) → `writeChart` per chart (via the Phase‑A mapping). If no `config.yaml` in bundle → seed the starter config (canvas readiness) and flag `seededConfig`.
- `appSlug` → `updateMetadata`. Imported stories keep their own frontmatter status/listed.
- Post‑write `loadStoryConfig(slug)`; on throw return 200 with a `warning` (don't fail). Orphan charts on overwrite: **warn, never auto‑delete**.
- `revalidatePath('/')`; return `{ ok, slug, charts, warnings }`.
- Add `fflate` to `apps/admin/package.json`.

**Homepage UI:** new client component `apps/admin/components/vizmaya/NewStoryPanel.tsx` (match `GenerateImagePanel`/`MoveStoryControl` dark‑theme + `useState` conventions): a "Create blank" section (title, auto‑suggested editable slug, app `<select>` from `/api/vizmaya/apps`) and an "Import bundle" section (drag/drop + hidden `<input type=file accept=.zip>`, app `<select>`, overwrite checkbox). On success → `router.push('/vizmaya/' + slug + '/canvas')`. Mount `<NewStoryPanel />` in `apps/admin/app/page.tsx` `Dashboard`, above `<DraftsList />`.

**Checkpoint C:** create → canvas renders; import → canvas renders + charts load; both show in `DraftsList`; both render on vizmaya‑fyi.

### Phase D — Force DB‑only & delete files (LAST)

- **`packages/content-source/src/contentSource.ts`:** delete `fs`/`path` imports, `STORIES_DIR`, `fsReadIfExists`, `VERTICAL_TO_APP_SLUG`/`deriveAppSlugFromFrontmatter` (now in `storyMapping`), and the entire `fsSource`. Selector always returns `dbSource`; drop the `CONTENT_SOURCE` read; keep the `ContentSource` interface + `__setContentSourceForTests`; update the header comment to "DB is the only source."
- **Delete:** `scripts/sync-fs-to-db.ts`, `scripts/migrate-content-to-db.ts`, `scripts/migrate-hero-split.ts`, `scripts/ingest-source.ts`, `scripts/ingest/` (verify dir contents), `lib/syncToDb.ts`, and the entire `apps/vizmaya-fyi/content/` dir.
- **`scripts/generate-audio.ts`:** remove the fs branches (`USE_DB_CONTENT`/`STORIES_DIR`) → DB‑only. **`scripts/populate-display-order.ts`:** drop the CONTENT_SOURCE mode log (optional).
- **`apps/vizmaya-fyi/package.json`:** remove the `prebuild` line, the `migrate-content` script, and the `ingest` script. Keep `populate-order`, `generate-audio`.
- **`turbo.json`:** remove `"CONTENT_SOURCE"` from `build.env`. Render workflows already set `CONTENT_SOURCE: db` — verify `render-audio.yml` still works DB‑only; optionally strip the now‑redundant lines.
- **Docs + comments:** update `apps/vizmaya-fyi/README.md`, `CLAUDE.md` (mark cutover complete), `instructions.md`, `docs/db-backed-content-plan.md`, `docs/gcp-render-migration.md`; fix the fs‑mentioning comments in `storyTts.ts`, `storyReportConfig.ts`, `storyMapOverrides.ts`, `ChartPanel.tsx`, `handlers/chartData.ts`. **Create** `apps/vizmaya-fyi/.env.example` (and optionally `apps/admin/.env.example`) listing the now‑mandatory `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`.

**Checkpoint D:** both apps `pnpm build` green in db mode with Supabase env; `grep -rn "content/stories\|fsSource\|CONTENT_SOURCE"` returns only intended remnants; consumer fully renders from DB.

## Critical files

- `packages/content-source/src/contentSource.ts` — collapse to DB‑only (Phase D); source of mapping moves out (Phase A)
- `packages/content-source/src/storyMapping.ts` — **new** shared mapping (Phase A)
- `apps/vizmaya-fyi/lib/syncToDb.ts` — re‑point to mapping + add report/tts/map reads (A), delete (D)
- `apps/vizmaya-fyi/scripts/migrate-content-to-db.ts` — final seed (B), delete (D)
- `apps/admin/app/api/vizmaya/stories/route.ts` — add `POST` create (C)
- `apps/admin/app/api/vizmaya/stories/import/route.ts` — **new** bundle import (C)
- `apps/admin/lib/storyValidation.ts` — **new**, shared validators (C)
- `apps/admin/components/vizmaya/NewStoryPanel.tsx` — **new** homepage UI (C)
- `apps/admin/app/page.tsx` — mount the panel (C)
- `apps/admin/app/vizmaya/[slug]/canvas/page.tsx` — readiness reference (requires config + ≥1 section)
- `apps/vizmaya-fyi/package.json`, `turbo.json` — remove prebuild hook + CONTENT_SOURCE (D)

## Verification

- **Automated:** `pnpm typecheck`, `pnpm lint`, and `pnpm build` with Supabase env (db mode) to exercise consumer `generateStaticParams` against the DB. No `pnpm test` exists.
- **Manual E2E (db mode):** run admin → log in → **create blank** → confirm redirect to `/vizmaya/[slug]/canvas` and the canvas renders → story appears in `DraftsList`; **import a `.zip`** of one of the exported stories under a fresh slug → canvas renders + charts load; assign an app via `MoveStoryControl`; run vizmaya‑fyi → `/story/[slug]` renders prose + map + `/api/chart-data/[slug]/[id]`; open an existing migrated story's canvas to confirm no regression.
- Use the `preview_*` tools to verify the admin homepage panel and the canvas/consumer render.

## Risk register (risk → mitigation)

- **Mapping gap loses report/tts/map/app_slug** → fixed in Phase A; gap‑fill + Checkpoint B parity gate before any delete.
- **Delete while a build still runs in fs mode** → Phase D gate confirms prod/Vercel `CONTENT_SOURCE` is unset/db and a green db build before deleting `content/`.
- **Local dev breaks without Supabase creds** → document required `.env.local`; ship `.env.example`; delete `fsSource` only in Phase D after C proves db mode E2E.
- **Canvas 404 for new stories** → seed minimal valid `config.yaml` + markdown heading on create/import.
- **Slug collision overwrites a story** → existence check → 409 on create; 409‑unless‑overwrite on import.
- **Publish‑unlisted exposure** (accepted) → URL is public; mitigate with non‑guessable slugs; revisit "admin draft preview" hardening in the follow‑up.
- **Non‑atomic multi‑write import** → validate everything before writing; `writeMarkdown` first; acceptable for an admin tool (no transaction API on `ContentSource`).

## Out of scope — follow‑up (separate plan)

- AI **draft‑story‑from‑a‑brief** and **in‑canvas AI assist** via `packages/ai-gateway` (`generateText`/`generateImage`, `definePrompt`, `ai_generations` audit table already exist). Rebuild PDF ingest on top of this if still wanted.
- Optionally upgrade "publish unlisted" → authenticated/signed **draft preview** (relax `getStoryContent`'s prod draft guard for admin/signed contexts) so unfinished stories aren't public by URL.
