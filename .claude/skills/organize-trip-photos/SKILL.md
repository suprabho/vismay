---
name: organize-trip-photos
description: >-
  Download a trip's photos/videos from Google Drive (or a local folder),
  auto-organize them against the trip's itinerary (EXIF time/GPS → day and
  stop), downscale + strip GPS, write the media manifest, and stage
  everything for upload to the story-assets bucket. Use when the user wants
  to add trip photos to a travel story — e.g. "organize my New York photos",
  "add my Day 3 photos to the trip", "pull trip photos from Drive".
---

# Organize trip photos

Turn a folder of raw trip photos/videos into upload-ready, manifest-tracked
media for a travel story in `apps/travel/web/content/stories/`.

**Inputs to establish with the user before starting:**
1. **Trip slug** — e.g. `new-york-2026`. Must have a `<slug>.trip.yaml`
   (created by `pnpm travel:import`). List candidates:
   `ls apps/travel/web/content/stories/*.trip.yaml`.
2. **Source** — ONE of:
   - a **Google Drive folder** (name or link) the photos were exported to, or
   - a **local folder path** (Cowork/desktop sessions: often `~/Downloads/...`
     or a folder the user drags in).
3. Optionally a **day number** if the whole batch belongs to one day
   (`--day 3`) — useful when EXIF is unreliable.

## Step 0 — get the photos out of Google Photos (user does this; walk them through it)

Google Photos has NO API access from our tooling — the photos must be
exported first. Tell the user exactly this, matched to their device:

- **Phone:** open Google Photos → select the trip/day's photos → Share →
  **Save to Drive** → pick/create a folder like `Trips/new-york/day-3`.
- **Desktop:** photos.google.com → select → Download (⇧D) → you get a zip;
  either upload the zip to a Drive folder or just keep it local and give me
  the unzipped folder path.

Notes to pass on: download as **JPG** where offered (HEIC originals can't be
processed by our resize step and get copied through untouched); photos saved
via WhatsApp/Telegram have EXIF stripped and will need manual day/stop
assignment; videos should be **.mp4** (convert `.mov` with
`ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4`).

## Step 1 — fetch into the staging area

Target: `vizmaya-data/travel-media/<slug>/incoming/` (gitignored).

- **Drive source:** locate the folder with the Google Drive tools (search by
  name or resolve the shared link), then download every image/video in it
  into the target folder. Unzip any zips.
- **Local source:** copy (don't move) the files into the target folder.

## Step 2 — organize + downscale

```bash
pnpm travel:prepare-media --slug <slug> [--day N] [--dry-run]
```

(From the vismay repo root. Run `pnpm install` first if node_modules is
missing.) This reads `<slug>.trip.yaml`, then per photo: EXIF date → day,
GPS proximity (≤1 km) → stop, else the time slot (last stop scheduled before
the photo). Files are renamed `d<N>-<stop-slug>-<seq>.jpg`, downscaled to
max edge 2560 px JPEG q82, auto-oriented, and **all metadata including GPS
is stripped** (they land in a PUBLIC bucket). Output goes to
`vizmaya-data/travel-media/<slug>/staged/` and rows are MERGED into
`apps/travel/web/content/stories/<slug>.media.yaml` — existing rows and
captions are never touched, so re-runs are safe.

Fallback if `sharp` won't run in this environment: resize in place with
`sips -Z 2560 *.jpg` (macOS) or `magick mogrify -resize '2560x2560>' *.jpg`,
then re-run the script — it skips files it can't decode by copying them, so
pre-shrunk files pass through fine.

## Step 3 — review the manifest (with the user)

Open `<slug>.media.yaml`:
- Fix any `match: manual` rows (fill `day:` + `stop:` — stop slugs are in
  `<slug>.trip.yaml`; leave `stop: null` for day-level media).
- Spot-check `match: auto` rows — EXIF matching is a heuristic.
- Add `caption:` lines — these show in the journey-view lightbox and are
  great raw material for the scrapbook story.

## Step 4 — upload to the bucket

Either (needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):

```bash
pnpm travel:upload-media --slug <slug>
```

(idempotent — already-uploaded files are skipped), **or** point the user at
the travel app's `/upload` page (admin password) — that path downscales
on-device and is the right one when the user is on their phone.

## Step 5 — wire into the story + ship

- The **journey map** picks the media up automatically from the manifest
  (photo-thumbnail pins + stop sheet strips). Nothing to do.
- For the **scrapbook story**, add foreground layers to
  `<slug>.config.yaml` sections referencing `assets://<slug>/<file>`:
  single photo → `{type: image, src: ...}`; 2–6 photos →
  `{type: imageGrid, images: [{src, caption}, ...]}`; clip →
  `{type: video, src: ...}`; tilted scrapbook shot →
  `{type: travel:polaroid, src, caption, rotation: -4}`.
- Verify: `pnpm --filter @travel/web dev` → `/t/<slug>` and
  `/t/<slug>/story`.
- Commit `media.yaml` + any config/markdown edits and push. Staged/incoming
  media folders stay untracked — the bucket is the media store.
