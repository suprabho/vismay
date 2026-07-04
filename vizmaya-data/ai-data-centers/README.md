# ai-data-centers — source of record

A data story on the build-out of frontier AI data centers, sourced from
**Epoch AI's Frontier Data Centers Hub** (CC BY 4.0). Follows the
`vizmaya-data/<story>/` layout (see `../ebola-data/` for the sibling pattern).

> **Snapshot warning.** The CSVs and chart JSONs here are a *representative
> snapshot* compiled from public reporting, **not** a verbatim copy of the
> Epoch CSV — epoch.ai is unreachable from the dev sandbox. Reconcile every
> figure against the live `dc_facilities` / `dc_facility_timeline` tables
> before publishing. See `INGEST_NOTES.md`.

## Files

| File | What it is |
|------|-----------|
| `data_centers.csv` | One row per facility: compute (H100e), power (MW), capex, owner, users, location. |
| `data_center_timelines.csv` | Build-out time series: power / compute / capex per facility per date. |
| `story.yaml` | Story manifest — datasets, chart registry, sections, sources, caveats. |
| `charts/*.json` | ECharts option objects with a leading `_meta` block. Ignored by ECharts at render. |
| `INGEST_NOTES.md` | Per-figure provenance and the reconciliation checklist. |
| `CLAUDE.md` | Project scope — allowed sources, in/out of scope. |

## Relationship to the live pipeline

- **Live data** flows Epoch CSV → `scripts/ai-data-centers/import-data-centers.ts`
  → Supabase `dc_facilities` / `dc_facility_timeline`, refreshed weekly by
  `.github/workflows/import-ai-data-centers.yml`. The `/ai-data-centers`
  explorer reads that (always current).
- **This story** is a *frozen* editorial snapshot. Its runtime copies live at
  `apps/vizmaya-fyi/content/stories/ai-data-centers.{md,config.yaml}` +
  `content/stories/ai-data-centers/charts/*.json`, served by the existing
  `/api/chart-data/[slug]/[id]` handler.

## Refreshing (advancing the data cutoff)

1. Pull the latest into Supabase (`pnpm ai-data-centers:import`, or the GH
   Action) and read current values from `dc_facilities` / `dc_facility_timeline`.
2. Update the CSVs here and the `data`/series arrays in `charts/*.json`.
3. Bump `_meta.data_cutoff` in every chart **and** `data_cutoff` in `story.yaml`.
4. Copy the updated `charts/*.json` (as runtime `{steps:[{title,option}]}` files)
   into `content/stories/ai-data-centers/charts/`.
