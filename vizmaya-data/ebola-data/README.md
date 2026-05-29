# Ebola 2026 — outbreak surveillance data

CSVs, ECharts configs and editorial copy for the Vizmaya.fyi story on the
May 2026 Bundibugyo virus disease (BVD) outbreak in DRC and Uganda.

| File | Kind | Rows | Status |
|---|---|---|---|
| `ebola_outbreaks_history.csv` | data | 58 | Complete — every CDC-recorded outbreak 1976→2026 |
| `drc_2026_health_zones.csv` | data | 10 | Live — Ituri zones + N. Kivu + S. Kivu + Kampala, as of 26 May 2026 |
| `timeline_2026.csv` | data | 18 | Live — events from index onset to 26 May |
| `by_species.csv` | data | 5 | Reference — Zaire / Sudan / Bundibugyo / Taï / Reston |
| `genomic_2026.csv` | data | 9 | Reference — Nextstrain BDBV build facts |
| `story.yaml` | manifest | — | Section order, dataset registry, chart registry |
| `REPORT.md` | editorial | — | Long-form write-up |
| `CLAUDE.md` | scope doc | — | Surveillance-journalism framing for Claude Code sessions |
| `charts/*.json` | viz | 6 | ECharts option objects, one per chart |

See `INGEST_NOTES.md` for the per-figure provenance, source-page caveats,
and the suspected-vs-confirmed reclassification gotcha that produces
downward revisions over time.

## Conventions

- Flat layout at the root of this folder (matches `vizmaya-data/coke-studio/`).
- Dates are `YYYY-MM-DD`.
- CFR is stored as percent (integer or one-decimal float).
- Health-zone names are spelled as they appear in WHO DON / DRC MoH bulletins.
- Species values are the historical names (`Zaire`, `Sudan`, `Bundibugyo`,
  `Tai Forest`, `Reston`), not the 2023 ICTV renames (`Orthoebolavirus
  zairense` etc.) — the scientific names sit in `by_species.csv` and the
  inline notes.
- Cumulative country totals in `ebola_outbreaks_history.csv` are by
  outbreak event, not aggregated; aggregation is done downstream in the
  chart configs and the report.
- Idempotent natural keys (informal):
  - `ebola_outbreaks_history.csv` → `(year, country, location, species)`
  - `drc_2026_health_zones.csv` → `(province, health_zone)`
  - `timeline_2026.csv` → `(date, event)`
  - `by_species.csv` → `species`
  - `genomic_2026.csv` → `aspect`

## Chart configs

`charts/*.json` are ECharts option objects following the existing monorepo
pattern (see `regulatory-gantt.json`, `regulatory-timeline-swimlanes.json`
and `echarts-timeline-options.md` at the repo root). Each file carries a
leading `_meta` block (`id`, `title`, `subtitle`, `source`, `note`) which
ECharts ignores at render but downstream renderers should surface as
caption/credit text.

| File | Type | Reads from |
|---|---|---|
| `charts/growth.json` | dual-axis line | confirmed vs suspected timeline |
| `charts/countries.json` | horizontal bar | cumulative cases by country |
| `charts/health-zones.json` | horizontal bar | DRC zones, Ituri only |
| `charts/species.json` | grouped column + line | log-scale cases + CFR % |
| `charts/genome-timeline.json` | scatter | BDBV genomes by year sampled |
| `charts/outbreak-timeline.json` | time-axis scatter, 4 lanes | 2026 events |

## Reporting cut-off

All figures are anchored to **26–27 May 2026**. Re-cite the cut-off date
on every section so readers know what they're looking at. Suspected →
confirmed reclassification produces downward revisions over time; that's
not a bug.

## Refreshing

This story is **active**. To pull the next sit-rep:

1. Check WHO DON 2026-DON603 and any new DON in the same series.
2. Cross-check against the WHO AFRO weekly bulletin (PDF) and the ECDC
   outbreak page.
3. Update `timeline_2026.csv` with a new row.
4. Update `drc_2026_health_zones.csv` confirmed/suspected columns.
5. Append the new datapoint to the `growth.json` series (both `data`
   arrays and the `xAxis.data` labels).
6. Update the `_meta.data_cutoff` in `growth.json` and the `data_cutoff`
   in `story.yaml`.
7. Spot-check the suspected count against the prior reading — if it went
   down, leave a note in `INGEST_NOTES.md` explaining the reclassification.
