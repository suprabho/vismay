# Travel app (apps/travel/web): Claude Code instructions

Password-gated trip sharing for friends and family. Each trip has TWO views
from ONE content source:

- **Journey map** — `/t/<slug>` — interactive Mapbox map: day tabs, colored
  stop markers (photo thumbnails when a stop has media), dashed routes,
  stay/airport markers, stop sheet with media strip + lightbox.
- **Scrapbook story** — `/t/<slug>/story` — scroll-synced story on a
  persistent map (the vismay story engine, `format: map`, `vertical: travel`).

## Files per trip (in `content/stories/`)

| File | Owner | Purpose |
|---|---|---|
| `<slug>.trip.yaml` | **generated** — `pnpm travel:import` | Structured itinerary; the journey view reads this. Regenerated freely; never hand-edit prose here. |
| `<slug>.media.yaml` | photo pipeline + hand edits | Media manifest: one row per photo/video (`file`, `day`, `stop`, `caption`). Journey view merges it onto stops automatically. |
| `<slug>.md` | **hand-owned** after scaffold | Story prose. One `## Day N: …` heading per day, one `##` heading per stop (headings are the config's anchors — renaming one means updating its `text:` in the config). |
| `<slug>.config.yaml` | **hand-owned** after scaffold | Map cameras + pins + photo layers. One section per day, one subsection per stop. |

**Coordinates are `[lng, lat]` (Mapbox order) everywhere in this app** — the
importer flips them from pro-trip's `lat, lng` comments. This is the #1 bug
source; when adding coordinates by hand, longitude comes FIRST (New York is
`[-73.99, 40.72]`).

## Data flow

```
pro-trip content/trips/<id>.md ──pnpm travel:import──▶ <slug>.trip.yaml (+ md/config scaffold once)
Google Photos ──(manual export)──▶ Drive/local folder ──organize-trip-photos skill──▶
  vizmaya-data/travel-media/<slug>/staged/ + <slug>.media.yaml ──pnpm travel:upload-media──▶
  story-assets bucket ──assets://<slug>/<file>──▶ both views
```

## Commands (run from the repo root)

- `pnpm travel:import <pro-trip md> [--slug s] [--force]` — (re)import an
  itinerary. `--force` overwrites the hand-owned md/config — say so before using it.
- `pnpm travel:prepare-media --slug <s> [--day N] [--dry-run]` — organize
  photos from `vizmaya-data/travel-media/<s>/incoming/` (EXIF → day/stop,
  downscale, strip GPS, merge manifest). See `.claude/skills/organize-trip-photos`.
- `pnpm travel:upload-media --slug <s>` — push staged media to the bucket (idempotent).
- `pnpm travel:set-password <s> <password> [--status live]` — create/rotate the
  trip's viewer password (rotation invalidates outstanding cookies).
- `pnpm --filter @travel/web dev` / `typecheck` — run + verify.

## Common phone prompts

- *Add a photo to a stop:* "In new-york-2026.media.yaml, set the caption of
  d3-dumbo-piers-manhattan-skyline-01.jpg to 'skyline at sunrise', and add an
  imageGrid with the two DUMBO photos to the dumbo-piers subsection's
  foreground in the config. Typecheck, commit, push."
- *Add media to the scrapbook:* foreground layers on a section/subsection:
  single `{type: image, src: assets://<slug>/<file>}` · 2–6 photos
  `{type: imageGrid, images: [{src, caption}, …]}` · clip `{type: video, src}` ·
  tilted polaroid `{type: travel:polaroid, src, caption, rotation: -4}`.
- *Move/edit a stop:* edit `<slug>.md` (its `##` heading + prose), the matching
  section/subsection in `<slug>.config.yaml`, AND `<slug>.trip.yaml` (or
  re-import from pro-trip). Keep heading and `text:` anchor in sync.
- *Set/rotate the password:* run the set-password script above, then share the
  new password with the group.

## Gate + publishing

Trip stories stay `status: draft` + `listed: false` — the password gate
(`travel_trips` table, migration 073; cookie `vmy_demo_<slug>`) is the real
access boundary, and `lib/gate.ts` fails open ONLY in dev without Supabase
env. To go live: apply migration 073, `pnpm travel:set-password <slug> <pw>
--status live`, deploy, share `https://<domain>/t/<slug>` + the password.

Deploy (Vercel): project root `apps/travel/web`; env
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_MAPBOX_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
Content ships with the build — publishing content = git push.
