# DB-backed content — implementation plan

**Goal:** move story content (markdown + config YAML + share YAML + chart JSON) from filesystem into Supabase Postgres so edits can go live without redeploying code. Keep existing readers, parsers, and render paths as intact as possible.

**Branch:** `feat/db-backed-content`

---

## Design decision: blob over normalized

Store each file's raw text as a single column rather than decomposing the YAML structure into tables.

```
stories
  slug           text primary key
  title          text          -- denormalized for list queries
  status         text          -- 'draft' | 'published'
  listed         bool
  markdown       text          -- entire .md (frontmatter + prose)
  config_yaml    text          -- entire .config.yaml
  share_yaml     text          -- entire .share.yaml
  updated_at     timestamptz
  published_at   timestamptz

chart_data
  slug           text
  chart_id       text
  data           jsonb
  primary key (slug, chart_id)

story_versions
  id             bigserial primary key
  slug           text
  snapshot       jsonb         -- { markdown, config_yaml, share_yaml }
  created_at     timestamptz
  created_by     uuid
```

**Why blob.** The YAML configs are 550–750 lines of deeply nested map/chart/scroll structures. Normalizing would require ~10 tables, weeks of work, and the DB's structure-awareness buys nothing because we never query inside the config — we just load the whole thing for one story at a time. Blob keeps `gray-matter` and `yaml.parse` unchanged.

**Tradeoff accepted.** We lose git diffability of content. `story_versions` mitigates (snapshot on every save). Files remain in `content/stories/` as backup for the first few weeks.

---

## Supabase is already wired up

- `@supabase/supabase-js` installed (`package.json`)
- `lib/supabase.ts` exports `createBrowserClient()` and `createServiceClient()`
- Existing migrations in `supabase/migrations/` (001 story_audio, 002–004 epstein). Next migration number: **005**.
- Env vars assumed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

This cuts phase 1 to zero and simplifies phase 6 (auth).

---

## Phase 2 — Schema + migration script (~1 day)

1. `supabase/migrations/005_story_content.sql` — `stories`, `chart_data`, `story_versions` + indices + RLS (public read on published, service-role write).
2. `scripts/migrate-content-to-db.ts` — walk `content/stories/`, upsert each story's md/yaml/share into `stories`; walk `content/stories/<slug>/charts/*.json` into `chart_data`. Idempotent (upsert by slug).
3. Run once against Supabase.
4. Keep files in git as backup. Do not delete.

---

## Phase 3 — Refactor readers (~1 day)

Touch points from exploration:

- `lib/content.ts` — `getStoryContent`, `getAllStorySlugs`, `getAllStories`, `getViewableStorySlugs`
- `lib/storyConfig.ts` — `loadStoryConfig`, `loadShareConfig`
- `app/api/chart-data/[slug]/[id]/route.ts` — swap `readFileSync` for DB lookup (drop path-traversal check)
- `/api/stories/configs`, `/api/stories/themes` — same swap

**Strategy:** introduce `lib/contentSource.ts` with a single interface. Two implementations: `fsSource` (current behavior) and `dbSource` (Supabase queries). Env var `CONTENT_SOURCE=fs|db` picks which. Default `fs` in dev, `db` in prod. This is the local-dev escape hatch.

`gray-matter` and `yaml.parse` still run — they just get a string from Postgres instead of disk.

Add a per-request memoization layer so one page render doesn't hit the DB six times.

---

## Phase 4 — ISR wiring (~0.5 day)

- Keep `generateStaticParams` but source the slug list from DB.
- `export const revalidate = false` on `/story/[slug]` — pages stay static until invalidated.
- On save in admin editor → call `revalidatePath('/story/[slug]')` and `revalidateTag('stories')`.
- Edits go live in ~1 second with no rebuild.

---

## Phase 5 — Admin editor UI (~2 days, biggest chunk)

Three routes under `/app/admin/`:

1. **`/admin`** — list of stories, status, last edited, "new story" button.
2. **`/admin/[slug]`** — three Monaco editor panes (markdown, config yaml, share yaml) side-by-side with a live preview iframe → `/story/[slug]?preview=<token>`. Save POSTs to `/api/admin/stories/[slug]`.
3. **`/admin/[slug]/charts/[id]`** — Monaco JSON editor for chart data.

**Why Monaco over typed forms:** 550+ lines of nested YAML per config. Building field-level forms is weeks of work and worse UX than editing YAML directly. Monaco + `monaco-yaml` gives schema validation and autocomplete for 20% of the effort. Can add bespoke editors later (map picker for `center`, chart step editor).

**Preview flow:** draft rows have `status='draft'`. Preview route reads drafts when a cookie/token is set; public route reads only `status='published'`. "Publish" copies draft → published.

**Server-side validation on save:** reuse the runtime validators already in `loadStoryConfig`. Parse YAML, reject invalid structures, surface errors inline.

---

## Phase 6 — Auth (~0.5 day)

- Supabase Auth magic-link email.
- `allowed_editors` table OR env allowlist of editor emails.
- `middleware.ts` protecting `/admin/*` and `/api/admin/*`.
- RLS on write so only authed editors can mutate `stories` / `chart_data`.

Single editor (you) → magic link is sufficient.

---

## Phase 7 — Polish + edge cases (~1 day)

- **Local dev fallback:** `CONTENT_SOURCE=fs` (see phase 3). Keeps `next dev` + file editing loop alive.
- **Version history UI:** `/admin/[slug]/history` — list `story_versions` snapshots with diff view (use `diff` package, textarea-based).
- **Backup:** nightly GitHub Action dumps `stories` + `chart_data` to a gist/blob. Free-tier Supabase has no PITR.
- **Image assets:** none today. If added later → Supabase Storage bucket (already have `story-audio` as a pattern).

---

## Total estimate

| Phase | Days |
|---|---|
| 2. Schema + migration | 1 |
| 3. Refactor readers | 1 |
| 4. ISR wiring | 0.5 |
| 5. Editor UI | 2 |
| 6. Auth | 0.5 |
| 7. Polish | 1 |
| **Total** | **~6 days** (~7–8 with buffer) |

Phase 1 is zero — Supabase already wired.

---

## Risks

1. **Loss of git blame on content.** `story_versions` is a partial substitute. Mitigation: nightly export to a backup repo.
2. **Schema drift.** Once content is in DB, YAML-shape changes = data migration, not just a code edit. Trading editor flexibility for schema inertia.
3. **Editor-is-the-product.** `vim story.config.yaml` is today's CMS. Monaco + `monaco-yaml` schema must match that ergonomically or it'll feel worse.
4. **Two-writer drift.** If edits happen both through the admin UI and via direct file commits, they diverge. Cutover day → one source of truth only.

---

## Out of scope (for now)

- Typed form editors per field (map picker, chart step editor, region picker). Future enhancement after Monaco baseline ships.
- Multi-editor roles/permissions. Single-editor assumption.
- CDN-level cache purging beyond Next.js `revalidatePath`.
- Asset upload pipeline (no images co-located today).

---

## Cutover checklist (when phases 2–6 done)

- [ ] Migration script run against prod Supabase
- [ ] Spot-check 2–3 stories render identically from DB source vs fs source
- [ ] Auth working on `/admin`
- [ ] `revalidatePath` confirmed working on save
- [ ] Flip `CONTENT_SOURCE=db` in Vercel env
- [ ] Leave `content/stories/` committed for ≥2 weeks as rollback path
