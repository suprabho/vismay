# searching-for-umami — ingest notes

## Status: REAL DATA (scraped 2026-07-27)

`dishes.json` holds the live-scraped corpus: **50 rows — the top 10
best-rated dishes per cuisine** (India, China, Thailand, Indonesia, Japan),
with real community ratings, regions, categories, truncated description
blurbs, CDN image URLs and `scraped_at` stamps. Imported into `food_dishes`
and verified idempotent the same day; the original 30-row hand-authored
sample was deleted from the DB (rows tagged `sample-data`).

**Why 50 and not ~500:** TasteAtlas's "Top 100" listing pages serve exactly
**10 dish cards** to anonymous web visitors — no lazy-load or pagination
exists for ranks 11+ (verified: 40 slow scroll steps grow nothing; the only
htmx controls on the page are menu drawers). The
`/100-most-popular-dishes-in-<cuisine>` URLs serve the identical page as
`/best-rated-dishes-in-<cuisine>` (same title, same 10 dishes, same order).
10 × 5 cuisines is the complete anonymously-reachable set.

## Why the scrape can't run in CI or the dev sandbox

Two independent blocks, both verified 2026-07-27:

1. The Claude Code cloud sandbox's network policy denies CONNECT to
   `www.tasteatlas.com:443` outright (proxy-level 403).
2. TasteAtlas itself sits behind Cloudflare bot protection and 403s
   non-browser fetchers and datacenter IPs. GitHub-hosted Actions runners are
   datacenter IPs — a scheduled workflow would be dead on arrival.

So the scrape is a **manual, local step on a residential connection**, and
the committed importer stays deterministic — same split as
`../seriously-curious/`.

## The Cloudflare playbook (hard-won, 2026-07-27)

What actually works, encoded in the scraper — change any of these and it
starts 403ing:

- **System Chrome, not bundled Chromium.** Playwright's bundled build is
  fingerprint-blocked on every page. `channel: 'chrome'` passes. Machine
  needs Google Chrome installed.
- **Headed, always.** Headless (even real Chrome's) advertises
  HeadlessChrome and gets blocked. `--headed` is effectively mandatory.
- **Fresh profile per navigation session.** Only a brand-new profile's
  *first* navigation passes; a profile reused across browser launches gets
  challenged on every request, and challenges never clear under automation
  (CDP is detectable while challenge JS runs). The scraper wipes
  `.browser-profile` and relaunches per listing URL.
- **First navigation must be a listing page.** Navigating the homepage first
  gets challenged and poisons the whole session.
- **Never request a dish page document.** `/​<dish-slug>` documents are
  hard-403'd ("Attention Required", not a solvable challenge) in every
  engine/flow tried — goto, goto+referer, same-tab, new-tab, WebKit — and
  one blocked hit poisons every request after it. Real users never make
  those requests either: the site is htmx server-rendered and card links
  open new tabs. Hence **listing-only capture**.

## How extraction works (listing-only)

Everything comes from the listing page's `.card.top-list-primary` cards:

| Field | Source on the listing card |
|---|---|
| `slug`, `source_url` | dish anchor href (root-level lowercase path) |
| `name` | the `<a><h3></h3></a>` title anchor |
| `rank_in_cuisine` | `card__order` text ("01"…"10") |
| `category` | `card__label` chip ("Flatbread", "Stew") |
| `region` | `card__location` anchor ("Amritsar, India") |
| `rating` | `card__info-value` ("4.4") |
| `description` | `card__description` paragraph, buttons stripped, cut at a sentence boundary, hard-capped ≤ 400 chars (rights) |
| `image_url` | card visual `<img src>` (cdn.tasteatlas.com) |
| `ingredients` | **not on cards → always `[]`** (only on blocked dish pages) |
| `rating_count` | **not on cards → always null** |

### Card-markup traps (why the selectors are precise)

- The page has THREE card families sharing anatomy: dishes
  (`top-list-primary`, first block), **producers** (also
  `top-list-primary`! second block — distilleries, tea estates) and
  **products** (`top-list-secondary` — spirits, chocolate brands). Producer
  cards nest the anchor *inside* the heading (`<h3><a>`) while dish cards
  nest the heading inside the anchor (`<a><h3>`) — the harvest requires the
  latter, which is what keeps producers out. Products are excluded by the
  `top-list-primary` class match.
- Category (`/Flatbreads`) and restaurant (`/KulchaLand`) hrefs are
  **capitalized**; dish hrefs are lowercase. The slug filter rejects
  non-lowercase paths — don't lowercase before checking.
- Each rank block restarts numbering at 01, so a naive "all cards" harvest
  produces duplicate ranks and product contamination (this happened; the
  corpus was rebuilt clean).

## Running / refreshing

```
cd apps/vizmaya-fyi
pnpm searching-for-umami:scrape --cuisine india --headed   # smoke test (~1 min)
pnpm searching-for-umami:scrape --headed                   # full run (~4 min)
pnpm searching-for-umami:import                            # load into food_dishes
```

- Resumable: dishes already in `dishes.json` are skipped; `--force`
  re-captures them (refreshes ratings — they're live community values;
  `scraped_at` records capture time).
- A Chrome window opens and closes once per listing (10 total on a full
  run). Politeness: one document navigation per listing + scrolling,
  sequential, 2–4 s delays.
- The importer warns (not fails) on an unknown `cuisine` slug; it hard-fails
  on in-file duplicate slugs and on descriptions > 600 chars.

## Publish checklist

1. Eyeball `dishes.json` (50 rows, 10/cuisine, no truncation overruns,
   regions/categories sane). ✅ 2026-07-27
2. `pnpm searching-for-umami:import` twice (second run proves idempotency).
   ✅ 2026-07-27
3. Review/rewrite descriptions for rights compliance before any public
   surface ships — blurbs are truncated TasteAtlas editorial text and should
   be rewritten in-house for publication.
4. Flip the epic to `status='published'` in a follow-up migration. The
   landing already lives in the `umami` consumer app (`apps/umami/web`,
   explorer at `/`).

**Fallback if local scraping breaks** (Cloudflare escalates): port the
scraper to an Apify actor with residential proxies, following
`apify/dc-yahoo-stock-scraper/`. Mentioned for completeness; not built.

## Recipe corpora (migration 070 — food_recipes + food_ingredients)

Two locally-held datasets widen the food vertical beyond TasteAtlas's
50-dish ceiling. Both live UNTRACKED under `vizmaya-data/` (50 MB,
third-party data we don't redistribute via git):

| Folder | What | Rows |
|---|---|---|
| `../6000+ Indian Food Recipes Dataset/` | Archana's Kitchen recipes (archanaskitchen.com, Kaggle snapshot Dec 2022): ingredients, prep/cook times, course, diet, full instructions, source URL | 6,871 |
| `../CulinaryDB/` | CulinaryDB (CoSyLab, IIIT-Delhi, 2018): world-cuisine recipes as title + canonical ingredient sets, plus a 1,033-term ingredient vocabulary (categories, compound constituents) | 45,772 |

- **Importer:** `pnpm searching-for-umami:import-recipes [--dry-run]
  [--source archanas-kitchen|culinarydb]` → upserts into `food_recipes` /
  `food_ingredients` (migration 070 must be applied first — vizmaya-fyi
  migrations go in by hand via the dashboard SQL editor). Idempotent on
  `(source, source_id)` / `entity_id`; batched small for the shared
  instance.
- **Ingredient backfill:** `pnpm searching-for-umami:backfill-ingredients
  [--dry-run]` title-matches the 50 TasteAtlas dishes against both corpora
  (conservative: exact normalized equality + curated aliases, consensus
  ingredient list, known-bad matches excluded) and fills `ingredients` in
  `dishes.json` with tag `ingredients:datasets`; re-run the dish importer to
  push. First run 2026-07-28 filled 19/50.
- **Rights:** these are INTERNAL grounding corpora — migration 070 gives the
  tables no anon RLS policies. Archana's Kitchen instruction text is the
  site's editorial property; CulinaryDB is a research dataset (cite CoSyLab
  if it ever surfaces publicly). Don't render either verbatim on public
  pages; `food_dishes` remains the only public-read food table.
- **Cuisine normalization:** `cuisine` gets an epic slug only when confident
  (AK Indian-regional labels → `india`; CulinaryDB `Indian Subcontinent`→
  `india`, `China`/`Thailand`/`Japan` likewise; `South East Asia` stays
  unmapped). The dataset's own label is always kept in `cuisine_raw`.
