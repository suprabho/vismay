# The Odyssey voyage — literary-geography data

CSVs, ECharts configs and editorial copy for the Vizmaya.fyi story on
Odysseus's ten-year homeward voyage, mapped against real Mediterranean
geography — and against the scholarly consensus that most of it is invented.

| File | Kind | Rows | Status |
|---|---|---|---|
| `voyage_stops.csv` | data | 15 | The 14 landfalls in chronological order, with coordinates, duration, fleet/crew attrition and an ID-status tag |
| `route_theories.csv` | data | 5 | The five main schools of reconstruction (Traditional, Bérard, Bradford, Severin, Atlantic) |
| `episode_identifications.csv` | data | 34 | Rival landfall IDs per contested episode, with coordinates and status |
| `timeline_allocation.csv` | data | 14 | Where the ten years actually go — the detention paradox |
| `distances.csv` | data | 10 | Distance and transit-time facts (565 nm straight line vs the wandering loops) |
| `wine_dark_palette.csv` | data | 6 | The "wine-dark sea" colour motif and the Gladstone debate |
| `story.yaml` | manifest | — | Section order, dataset registry, chart registry, tokens |
| `REPORT.md` | editorial | — | Long-form write-up |
| `CLAUDE.md` | scope doc | — | Literary-geography framing for Claude Code sessions |
| `charts/*.json` | viz | 6 | ECharts option objects, one per chart |

See `INGEST_NOTES.md` for per-figure provenance, the reconstruction
assumptions (fleet size, per-ship crew), and which identifications rest on
excavation versus tradition.

## Conventions

- Flat layout at the root of this folder (matches `vizmaya-data/ebola-data/`
  and `vizmaya-data/coke-studio/`).
- Coordinates are decimal degrees (`lat`, `lon`), WGS84, to 4 dp.
- `duration_days` is an approximate integer for the time axis; the human label
  lives alongside it (`duration`, `duration_label`).
- **ID-status vocabulary** (the single most important column in this story):
  - `anchor` — undisputed, excavation-backed (Troy, Ismaros/Maroneia, Ithaki).
  - `real-navigation` — a real, mappable place (Cape Malea, the pivot).
  - `traditional` — a literary or tourist tradition, not an archaeological fact.
  - `contested` — multiple rival identifications exist.
  - `archaeological-contested` — excavated, but the Homeric link is questioned
    (the Necromanteion).
  - `anchor-contested` — a solid zone with a live sub-debate (Ithaki vs Paliki).
- Fleet/crew figures are **reconstructed** at 12 ships / ~720 men (~60 per
  ship); only the loss events are explicit in the text.
- Idempotent natural keys (informal):
  - `voyage_stops.csv` → `seq`
  - `route_theories.csv` → `theory_id`
  - `episode_identifications.csv` → `(seq, theory, proposed_place)`
  - `timeline_allocation.csv` → `seq`
  - `distances.csv` → `measure`
  - `wine_dark_palette.csv` → `step`

## Chart configs

`charts/*.json` are ECharts option objects following the existing monorepo
pattern (see `vizmaya-data/ebola-data/charts/` and the root
`regulatory-*.json`). Each file carries a leading `_meta` block (`id`, `title`,
`subtitle`, `source`, `note`) which ECharts ignores at render but downstream
renderers should surface as caption/credit text. Colours use the wine-dark
palette in `story.yaml`'s `tokens`.

| File | Type | Reads from |
|---|---|---|
| `charts/detention-paradox.json` | horizontal bar | `timeline_allocation` — days per phase |
| `charts/distance-vs-time.json` | horizontal bar, log | `distances` — days to get home |
| `charts/attrition.json` | dual-axis line | `voyage_stops` — ships and men surviving |
| `charts/casualties.json` | horizontal bar | `voyage_stops` — men lost per episode |
| `charts/route-theories.json` | scatter strip | `episode_identifications` — landfall longitudes by school |
| `charts/voyage-timeline.json` | lane scatter | `voyage_stops` — 14 stops across three lanes |

## The one rule

**Never present a single route as true.** The scholarly consensus is that
Books 9–12 mix dim real geography with pure invention. Everything after Cape
Malea is contested; the `id_status` column and the `route-theories` chart exist
to keep that honest on the page.

## Refreshing

This is a **literary** story, not a live feed — it does not need a refresh
cadence. The one genuinely live thread is the Ithaca-vs-Paliki debate: the
July 2026 Diggle/Underhill work reportedly undercuts Bittlestone's "separate
island" premise while still favouring "Ithaca = part of Kefalonia." Treat that
as a caveat box, not a settled claim, and update `voyage_stops.csv` (seq 14)
and `INGEST_NOTES.md` if the debate moves.
