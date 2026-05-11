# Epstein Document Visualization

A geospatial intelligence tool that ingests official Epstein-related government documents and renders interactive map-based stories — clustering locations, people, and events extracted via LLM NER.

## Data Sources

| Source | URL | Volume |
|--------|-----|--------|
| DOJ Epstein Library | https://www.justice.gov/epstein | ~3.5M pages, 2,000+ videos, 180,000 images |
| DOJ Disclosures | https://www.justice.gov/epstein/doj-disclosures | Primary text corpus |
| House Oversight Committee | https://oversight.house.gov | 33,295 pages (Sep 2025) + 20,000 pages (Nov 2025) |
| FBI Vault | https://vault.fbi.gov/jeffrey-epstein | 22 FOIA parts |

---

## Architecture

```
[Sources] → [Ingest] → [OCR/Extract] → [NER/Claude] → [Resolve/Geocode] → [Graph] → [Map UI]
```

### Tech Stack

| Layer | Tool |
|-------|------|
| Ingestion | Node.js + existing ingest pipeline |
| OCR | Tesseract.js / AWS Textract |
| NER | Claude API (structured output) |
| Storage | Postgres + pgvector (Supabase) |
| Geocoding | Nominatim (free) or Google Maps |
| Graph | graphology (JS) |
| Map | Deck.gl + Mapbox |
| Frontend | Next.js |

---

## Entity Schema

### Location
```ts
{
  id: string
  name: string
  lat: number
  lng: number
  mention_count: number
  mentioned_by: string[]   // people who mentioned this location
  source_docs: string[]
}
```

### Person
```ts
{
  id: string
  name: string
  role?: string
  associated_location: string   // e.g. "Trump" → "USA"
  mention_count: number
  source_docs: string[]
}
```

### Event
```ts
{
  id: string
  name: string
  date?: string
  location: string             // e.g. "2008 crash" → "New York"
  mention_count: number
  source_docs: string[]
}
```

### Substory
```ts
{
  id: string
  title: string               // LLM-generated summary
  people: string[]
  locations: string[]
  events: string[]
  doc_count: number
}
```

---

## Strategy update (2026-05)

The original plan was to build the corpus → NER → geocode → cluster pipeline from
scratch against the DOJ/FBI/House Oversight document sets. After scoping that
work we pivoted to **bootstrapping from a pre-built curated dataset**:

> [`dleerdefi/epstein-network-data`](https://github.com/dleerdefi/epstein-network-data)
> (MIT, v2.0 2025-11-16) — hand-curated graph of persons, organizations,
> citations, claims, relationships, flight logs, airports (geocoded), and the
> Black Book (geocoded), distilled from Birthday Book + Black Book + Flight
> Logs source documents.

It is **smaller** than what a full NER run would produce (287 persons, 559
flights covering 1991–1994, 534 relationships), but it is hand-curated,
citation-tracked, and immediately map-ready. That's a much better v1 starting
point than waiting on a 3.5M-page NER pipeline to be validated.

The corpus pipeline (Phases 1–4 below) is **not abandoned** — it is the
mechanism for enriching the curated graph later with DOJ Sep 2025, House
Oversight Nov 2025, and FBI Vault releases. It just stops being the critical
path for v1.

### What the curated import unlocks

Loader: [`scripts/epstein/import-curated.ts`](../../scripts/epstein/import-curated.ts)
Migration: [`supabase/migrations/016_epstein_curated.sql`](../../supabase/migrations/016_epstein_curated.sql)

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 \
  https://github.com/dleerdefi/epstein-network-data.git ../epstein-network-data
pnpm epstein:import-curated --repo-path ../epstein-network-data --dry-run   # smoke test
pnpm epstein:import-curated --repo-path ../epstein-network-data             # write
```

Dry-run against the upstream v2.0 snapshot produces:

| Table | Rows |
|---|---|
| `epstein_persons` | 286 |
| `epstein_organizations` | 97 |
| `epstein_citations` | 73 |
| `epstein_claims` | 53 |
| `epstein_relationships` | 534 (across 65 `rel_type` values) |
| `epstein_airports` | 272 (lat/lng) |
| `epstein_flights` | 559 (1991–1994; pages 1–31 of the logs) |
| `epstein_flight_passengers` | 1,181 (716 matched to a person via surname) |
| `epstein_blackbook` | 2,327 (1,759 geocoded: 1,390 via address, 369 via phone) |

---

## Phases & Progress

### Phase 0 — Curated bootstrap (active)
**Status:** `[x] Migration + loader landed, smoke test green` — needs a real Supabase apply + map UI rewrite

- [x] Migration `016_epstein_curated.sql` — 9 tables, polymorphic relationships
- [x] `scripts/epstein/import-curated.ts` — idempotent loader with `--dry-run`, `--only`
- [ ] Apply migration 016 to dev/prod Supabase and run a real import
- [ ] Rewrite `app/epstein/page.tsx` + `EpsteinMap.tsx` for the flight-network + Black Book view (airports + arcs + year slider + person filter)
- [ ] Adjust / add API routes under `app/api/epstein/` to serve the new tables

### Phase 1 — Ingestion & Text Extraction (deferred — enrichment path)
**Status:** `[~] Scripts built; deferred until curated MVP ships`

- [x] `scripts/epstein/crawl.ts` — crawls DOJ/FBI/House Oversight, upserts PDF URLs into `epstein_documents`
- [x] `scripts/epstein/ingest.ts` — downloads PDFs, extracts text via `pdf-parse`, chunks into ~2k tokens, stores in `epstein_chunks`
- [x] Supabase migration `002_epstein_pipeline.sql` — all tables + pgvector
- [ ] Run on sample 100 docs and validate
- [ ] OCR for scanned images (Tesseract.js — deferred until sample validates)

Run order (unchanged):
```bash
pnpm epstein:crawl --source=doj --limit=100 --dry-run
pnpm epstein:crawl --source=doj --limit=100
pnpm epstein:ingest --limit=100 --concurrency=3
```

### Phase 2 — Entity Extraction (NER) (deferred — enrichment path)
**Status:** `[~] Script built; deferred`

- [x] `scripts/epstein/ner.ts` — Claude Haiku structured extraction (locations/people/events)
- [x] Entity upsert with mention_count tracking
- [x] `epstein_mentions` junction table
- [ ] Run on sample chunks and validate quality
- [ ] Scale to full corpus
- [ ] Reconciliation strategy: how NER-extracted `epstein_people` rows merge into curated `epstein_persons` (likely a separate `epstein_person_aliases` join — TBD)

### Phase 3 — Entity Resolution & Geocoding (deferred — enrichment path)
**Status:** `[~] Script built; deferred`

- [x] `scripts/epstein/geocode.ts` — Nominatim, alias dedup, canonical name storage
- [ ] Run on extracted locations
- [ ] People → location resolution via Wikidata

### Phase 4 — Substory Graph (deferred — replaced by curated `epstein_relationships`)
**Status:** `[~] Script built; partly replaced by curated data`

- [x] `scripts/epstein/substories.ts` — co-occurrence graph via Union-Find, Claude Haiku title generation
- The curated dataset already provides 534 hand-curated relationships across 65 types — for v1 we lean on those instead of running clustering on top of NER output.
- The clustering script remains useful once the corpus pipeline is enabled, to surface clusters in newly-ingested DOJ/FBI material that aren't yet in the curated graph.

### Phase 5 — Map Visualization (in flight)
**Status:** `[~] Heatmap scaffold exists; needs rewrite for the curated dataset`

- [x] `app/epstein/page.tsx` + `EpsteinMap.tsx` — Deck.gl + Mapbox dark map
- [x] Heatmap + points layers (for NER mention data)
- [x] Substory sidebar
- [x] `app/api/epstein/entities/route.ts` + `substories/route.ts` — REST endpoints
- [ ] **Replace heatmap-of-mentions with flight network:** airports as sized points, flights as `ArcLayer`, year slider 1991–1994, click → passenger list
- [ ] Black Book address layer (~1,400 geocoded points)
- [ ] Person detail panel pulling from `epstein_relationships` + `epstein_citations`
- [ ] Source-doc drill-down via `epstein_citations.url`

Visit: `http://localhost:3000/epstein`

---

## Milestones

| Milestone | Status |
|-----------|--------|
| Curated import — migration + loader | `[x] Landed; needs Supabase apply` |
| Curated import — full data in Supabase | `[ ] Pending` |
| Flight-network map MVP | `[ ] Pending` |
| Black Book address layer | `[ ] Pending` |
| Person detail panel | `[ ] Pending` |
| Public launch | `[ ] Pending` |
| Corpus enrichment pipeline validated | `[ ] Deferred — post-launch` |

---

## Open Questions

- [ ] Coverage caveats in the UI — only 1991–1994 flight logs are parsed (pages 1–31). Pages 39–118 exist as JSON in `flight_logs_pdf/` from an external PDF parse — shape needs to be verified before adding to the loader's glob.
- [ ] Passenger → person match quality — current 716/1,181 (~61%) is a coarse surname-substring match. Worth an audit; may want `match_confidence` column + manual review for the ambiguous ones.
- [ ] Black Book geocoding match rate — 75.6% via fuzzy address + phone-area-code normalization. The remaining 24% are mostly entries with no address and a non-US/UK phone outside the cache.
- [ ] How / when to merge NER-extracted entities (`epstein_people`) into curated entities (`epstein_persons`) once the corpus pipeline is enabled.
- [ ] Upstream sync — do we vendor the data into `vendor/` via submodule, or pin a snapshot per loader run? Submodule keeps updates flowing in; a snapshot freezes provenance to one commit.

---

## Notes

- The curated dataset's `epstein_relationships` table includes some sensitive categories (`ABUSED`, `ALLEGED_ABUSER`, `ACCUSED_BY`, `ALLEGED_CO_CONSPIRATOR`, etc.). Each row carries `verification_status` (`Factual` / `Unverified`) and `citations[]` — the UI must surface those next to any visualization that uses these edges.
- `epstein_persons` is the curated table; `epstein_people` (migration 002) is the NER-extracted one. Don't merge accidentally — provenance levels differ.
- Substories are still the differentiator. The 65 `rel_type` values in `epstein_relationships` are a richer substrate for substory generation than co-occurrence in raw text would be.
