# INGEST_NOTES — ai-data-centers

Per-figure provenance and the pre-publish reconciliation checklist.

## Provenance status: SNAPSHOT, NOT VERBATIM

epoch.ai is blocked from the dev sandbox (proxy CONNECT 403) and fronts
Cloudflare bot detection that 403s generic fetchers. The figures in
`data_centers.csv`, `data_center_timelines.csv`, and `charts/*.json` were
compiled as **round, representative values** from public reporting on the
named campuses (Stargate Abilene, xAI Colossus, Meta Hyperion/Prometheus,
Amazon–Anthropic Project Rainier, Microsoft Fairwater). They exist so the
story and explorer render end-to-end; they are **not** Epoch's published
numbers.

## Reconciliation checklist (do before flipping the epic to `published`)

1. Run the importer against the real Epoch CSVs (GitHub Action → "Import AI
   Data Centers", or `pnpm ai-data-centers:import` from a network that can
   reach epoch.ai / a manual download placed in
   `apps/vizmaya-fyi/scripts/ai-data-centers/data/`).
2. Read `dc_facilities` and `dc_facility_timeline` from Supabase.
3. Replace every value in the CSVs and chart `data` arrays here with the
   Epoch figures. Facility names must match the importer's slugs.
4. Confirm the facility set — Epoch adds/removes campuses; the leaderboard
   and capex bar category lists (`yAxis.data`) must match.
5. Bump `_meta.data_cutoff` (charts) + `data_cutoff` (story.yaml) to the
   Epoch "last updated" date.
6. Regenerate the runtime chart snapshots in
   `apps/vizmaya-fyi/content/stories/ai-data-centers/charts/`.

## Gotchas

- **H100-equivalents** is a modeled performance unit, not a chip count — it
  blends GPU generations. Don't present it as "number of GPUs".
- **Power (MW)** is Epoch's estimate from satellite-visible cooling
  infrastructure; it carries real margins. Prefer "≈" in prose.
- **Capex** is cumulative committed capital in 2025 USD, not annual spend.
- Timeline dates are irregular observations, not a regular monthly series —
  the explorer's chart uses a time axis for this reason; keep story snapshots
  faithful to the observed dates.
