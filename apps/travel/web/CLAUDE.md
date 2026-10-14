# Travel app (apps/travel/web): Claude Code instructions

Password-gated trip sharing for friends and family. Each trip has TWO views
from ONE content source:

- **Journey map** — `/t/<slug>` — interactive Mapbox map: day tabs, colored
  stop markers (photo thumbnails when a stop has media), dashed routes,
  stay/airport markers, stop sheet with media strip + lightbox. All days.
- **Scrapbook story** — `/t/<slug>/story` — one-day scrapbook over a
  persistent map background: photo spreads (polaroids, photo stacks, grids),
  handwritten tape notes, ticket stubs, postmarks. Photos flow in from CURATED
  media at render time — see "Scrapbook" below. The day comes from `day:`
  frontmatter (default 3), and a trip can carry one story per day: story slug
  `<trip>-day-<n>` + `trip:` frontmatter naming the owning trip (gate,
  itinerary, and media are keyed on the trip slug).

- **HTML stories** — `/s/<slug>` — agent-authored, self-contained HTML pages
  (packages/html-stories, `app_slug = 'travel'`), each private to one trip.
  When a trip has one, the journey page's "Read the story" opens it (the
  scrapbook stays linked beside it). See "HTML stories" below.

Plus the admin surfaces (gated by `travel_admin` cookie, ADMIN_PASSWORD):

- **`/curate`** — THE media surface: browse everything for a trip, fix
  day/stop tags, captions, select/deselect (selected = shown in both views),
  feature-first, delete (bucket + DB), upload with auto-tagging.
- **`/upload`** — dead-simple bulk dump (sign → downscale on-device → PUT
  straight to the bucket); tag afterwards in /curate.

## Media manifest: DB-first (migration 074)

Media rows live in the **`travel_trip_media` table** (one row per photo/video:
trip_slug, file, kind, day, stop, caption, selected, sort_order, taken_at,
match, original). `/curate` edits it; the journey map (`readTripWithMedia`) and
the scrapbook (`getSelectedTripMedia`) read it — only `selected` rows render.
Accessors: `packages/content-source/src/travelMedia.ts`.

`<slug>.media.yaml` in git is now a **seed archive + dev fallback** — both read
paths fall back to it when Supabase env is missing, the table isn't migrated,
or it has zero rows for the trip. Do NOT hand-edit it expecting prod changes;
curate in `/curate` instead.

Known data quirk: `taken_at` values are IST-offset (+5:30), not local time —
the `original` filename (`YYYYMMDD_HHMMSS`) is the true local capture time.

## Files per trip (in `content/stories/`)

| File | Owner | Purpose |
|---|---|---|
| `<slug>.trip.yaml` | **generated** — `pnpm travel:import` | Structured itinerary; journey view + scrapbook injection read this. Never hand-edit prose here. |
| `<slug>.media.yaml` | seed archive | Fallback manifest (see above). Written by `prepare-media`, synced to DB by `sync-media-db`. |
| `<slug>.md` | **hand-owned** | Scrapbook prose. One `##` per spread (past-tense recollection); headings anchor the config's `text:`. |
| `<slug>.config.yaml` | **hand-owned** | One section per spread: map camera + `layout:` + `scrapbook:` block (+ optional hand-authored `foreground.regions` which win over injection). |

**Coordinates are `[lng, lat]` (Mapbox order) everywhere in this app.**

## Scrapbook architecture

`app/t/[slug]/story/page.tsx` fetches curated media (`lib/scrapbookMedia.ts`,
DB-first) and calls `hydrateTravelConfig` from
`@vismay/content-source/travelScrapbook` — the ONLY author of injected layer
shapes, shared with the admin canvas frames (`CanvasFrameSurface`) so previews
match production — which fills each section's foreground regions from its
`scrapbook: {stop, template?, max?, offset?, tip?, video?}` block. Templates: `hero` (1 full-bleed) · `scatter` (2-3 polaroids) · `grid`
(4-6 imageGrid) · `stack` (photoStack + "+N more") · `ticket`/`note`
(no-photo spreads). Layouts (`travel:spread-left/right/hero/center`) and
modules (`travel:polaroid/tapeNote/ticket/photoStack/postmark/prefetch`) live
in `verticals/travel-viz`. Gotchas:

- Layout regions need explicit heights (layers are absolutely positioned).
- Responsiveness model: layouts keep absolute region geometry in BOTH
  orientations (`stackOnPortrait: false`; overlay content must FIT the
  viewport — the snap scroller is behind it and can't be reached through a
  scrolling overlay). Sizes use clamp() + the `--sb-inset`/`--sb-stamp` vars
  from globals.css (tablet portrait widens gutters); root font-size is 20px
  → 14px on portrait, scoped to the story via `html:has([data-scrapbook])`.
- `style.portrait` blocks: only spread-center still stacks on portrait —
  visual layers there (the ticket) need `style.portrait.size.height`, text
  layers must NOT set one (intrinsic height, else prose clips). Elsewhere a
  layer needing distinct portrait geometry must author a COMPLETE portrait
  block (position + full size) — the engine's portrait merge is shallow, so
  partial blocks drop the authored width and lose `inset: 0`.
- A stop's second spread uses `offset:` to skip photos already shown;
  `video: true|<index>` opts a clip in (off by default).
- Bad layer configs vanish silently — check the browser console for zod
  errors and the `[scrapbook] injected layers` audit line.

## HTML stories

The same pipeline as vizmaya.fyi/footshorts/vizf1/viznba (an agent reads the
brief, writes one finished HTML page, posts it; documented in
[apps/vizmaya-fyi/CLAUDE.md](../../vizmaya-fyi/CLAUDE.md)), with travel's one
rule: **every page names its trip** — `<meta name="travel:trip"
content="<trip slug>">` — and its slug starts with the trip's
(`<trip>-day-3`). `lintHtml(html, { app: 'travel', slug })` refuses anything
else, at the publish API, in admin and in the seed script.

- **Serving:** `app/s/[slug]/route.ts` → `lib/htmlStories.ts`
  (`getTripHtmlStory`: the `html_stories` row first — a draft or archived row
  hides the story — else the git copy `content/html-stories/<slug>.html`),
  then `isTripAuthed(trip)` from `lib/gate.ts`: no cookie → 307 to
  `/t/<trip>/login?next=/s/<slug>` (the login page returns there via
  `safeReturnPath`). Served by the shared `htmlStoryResponse` with
  `{ private: true }`: Trips chrome (compass mark, links back to the trip's
  journey map and scrapbook), the sandbox CSP, `cache-control: private,
  no-store` and `x-robots-tag: noindex`. NEVER route a travel story through
  the public `serveHtmlStory` — its CDN caching would leak the page past the
  gate.
- **Listing:** no public listing (`/api/html-stories` is POST-only here). The
  journey page links the trip's stories via `listTripHtmlStories(trip)`.
- **Publish / brief / assets / formats:** `POST /api/html-stories`
  (`Authorization: Bearer $HTML_STORIES_TOKEN`), `GET /api/html-stories/brief`
  (`?trip=<slug>&day=<n>&prompt=…` with the token appends the trip context:
  the itinerary + curated photo URLs, read through `readTripWithMedia`, so the
  git fallbacks apply), `/api/html-stories/assets`, `/formats/*`.
- **Admin:** `/travel/html-stories` at vismay.xyz (paste, preview in the Trips
  chrome, publish, history; **Add trip** in the brief generator).
- **Photos** are the trip's own, linked by their public story-assets URLs
  (`<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/story-assets/<trip>/<file>`).
- **The NYC day-3 story** is one: `content/html-stories/new-york-2026-day-3.html`,
  the HTML version of the `new-york-2026` scrapbook (same prose, curated
  photos, a Mapbox sticky-map walk through the twelve stops). Edit it there,
  then `pnpm travel:sync-html-story --slug new-york-2026-day-3 --force` (or
  re-post it through the publish API) once the row exists.
- **The NYC day-3 board** is the same day as a pinned board (story format
  `board`): `content/html-stories/new-york-2026-day-3-board.html`. A corkboard
  with the day's map as its spine (an SVG chart that projects the stops, with
  a Mapbox Static Images picture under it when the site injects a token, a
  hand-drawn shoreline otherwise), each stop an index card strung to its stop
  (`data-pin-to="map:<n>"`) with its prints taped around it, and a tour that
  walks the day and grows the route as it goes (`data-stop`/`data-upto` on the
  steps). It is also the travel brief's board example
  (`GET /api/html-stories/brief?format=board`; `TRAVEL_BOARD_EXAMPLE` in
  packages/html-stories/src/formatBrief.ts): private trip content, so it is
  never copied under `/formats/examples/`. Seed it with
  `pnpm travel:sync-html-story --slug new-york-2026-day-3-board`.

## Data flow

```
pro-trip md ──pnpm travel:import──▶ <slug>.trip.yaml (+ md/config scaffold once)
photos ──▶ vizmaya-data/travel-media/<slug>/incoming/
  ──pnpm travel:prepare-media──▶ staged/ + <slug>.media.yaml
  ──pnpm travel:upload-media──▶ story-assets bucket (<slug>/<file>)
  ──pnpm travel:sync-media-db──▶ travel_trip_media (insert-only; curation wins)
/curate (phone) ──▶ travel_trip_media ──▶ journey map + scrapbook
```

## Commands (run from the repo root)

- `pnpm travel:import <pro-trip md> [--slug s] [--force]` — (re)import an
  itinerary. `--force` overwrites the hand-owned md/config — say so first.
- `pnpm travel:prepare-media --slug <s> [--day N] [--dry-run]` — organize
  incoming photos (EXIF → day/stop, downscale, strip GPS, merge manifest).
- `pnpm travel:upload-media --slug <s>` — push staged media to the bucket.
- `pnpm travel:sync-media-db --slug <s> [--dry-run] [--force]` — seed/sync the
  manifest into `travel_trip_media`. Insert-only by default; `--force`
  OVERWRITES curation edits — say so before using it.
- `pnpm travel:sync-trip-db --slug <s> [--dry-run]` — mirror `.trip.yaml` into
  `travel_trips.itinerary` (migration 076) so admin compose + canvas frames
  can read stops. `travel:import` does this automatically when Supabase env
  is present.
- `pnpm travel:sync-story-db --slug <s> [--dry-run] [--force]` — seed the
  story md + config into the shared `stories` table (`app_slug='travel'`).
  Insert-only by default; `--force` OVERWRITES admin canvas edits with the
  git files — say so before using it.
- `pnpm travel:sync-html-story --slug <story-slug> [--dry-run] [--force]` —
  seed a git HTML story (`content/html-stories/<slug>.html`) into
  `html_stories` (`app_slug='travel'`, published). Insert-only by default;
  `--force` replaces the row's HTML with the git copy (older versions stay
  restorable in admin) — say so before using it.
- `pnpm travel:set-password <s> <password> [--status live]` — viewer password.
- `pnpm --filter @travel/web dev` / `typecheck` — run + verify.

## Common phone prompts

- *Fix tagging / pick photos:* use `/curate` directly — filter by day/stop,
  tap a photo, set stop/caption/selected. Batch-assign via Select mode.
- *Add media to the scrapbook:* photos flow in automatically from curation;
  to change a spread's treatment edit its `scrapbook:` block (template/max/
  offset/video) or hand-author `foreground.regions` (they win per region).
- *Move/edit a stop:* edit `<slug>.md` (its `##` heading + prose), the
  matching section in `<slug>.config.yaml`, AND `<slug>.trip.yaml` (or
  re-import). Keep heading and `text:` anchor in sync.

## Gate + publishing

Trip stories stay `status: draft` + `listed: false` — the password gate
(`travel_trips` table, migration 073; cookie `vmy_demo_<slug>`) is the real
access boundary, and `lib/gate.ts` fails open ONLY in dev without Supabase
env. To go live: apply migrations 073 + **074** (hand-run in the Supabase SQL
editor — no CI applies them), seed media (`travel:sync-media-db`),
`pnpm travel:set-password <slug> <pw> --status live`, deploy, share
`https://<domain>/t/<slug>` + the password.

Deploy (Vercel): project root `apps/travel/web`; env
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_MAPBOX_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and
`HTML_STORIES_TOKEN` for the HTML story publish/brief/assets APIs (without it
they answer 503/401; `/s/<slug>` works regardless). HTML stories reuse the
`html_stories` table (migrations 085–089, already applied for the other sites).
Story prose/config: with `CONTENT_SOURCE=db` set (the target prod posture),
they read from the shared `stories` table — admin compose/canvas edits at
`vismay.xyz/travel` go live immediately, and the git files become the dev/seed
fallback (`travel:sync-story-db` seeds them). Without that env the app reads
git files (publishing = git push, the legacy posture). Media curation is live
via the DB either way.
