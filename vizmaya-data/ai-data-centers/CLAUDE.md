# CLAUDE.md — Project scope

## What this project is

A **data-infrastructure visualization story** for Vizmaya.fyi on the
build-out of frontier AI data centers — power capacity, compute, and capital
cost of the largest US AI campuses.

The deliverable is editorial Markdown, CSV, and JSON — a data story for
general readers, built from Epoch AI's open dataset.

## Sources (the only ones to use)

- **Epoch AI — Frontier Data Centers Hub** (CC BY 4.0) — the source of record:
  - https://epoch.ai/data/ai-data-centers
  - https://epoch.ai/data/data-centers-documentation
  - CSVs: `epoch.ai/data/generated/data_centers/data_centers.csv`,
    `.../data_center_timelines.csv`
- Epoch's own blog / documentation for methodology framing.
- Company announcements and permit filings only to corroborate an Epoch figure,
  never to replace it.

If a number is not in the Epoch dataset (or its documentation), it does not
go in as a data value.

## What's in scope

- Power capacity (MW), compute (H100-equivalents), capital cost per facility
- Build-out timelines and how fast capacity is being added
- Owners, users, projects, locations
- Data accessibility — formats, the CSV endpoints, refresh cadence, caveats
- Epoch's estimation methodology at a descriptive level (satellite + permits)

## What's out of scope

- Reverse-engineering specific security postures of named facilities
- Speculation about undisclosed military / classified compute
- Investment advice or price-target claims
- Precise addresses beyond city/campus level already published by Epoch

## Attribution

Epoch AI's data is CC BY 4.0 — **attribution is required** wherever it
appears. Every chart's `_meta.source`, the story source list, and the
explorer UI must credit "Epoch AI — Frontier Data Centers (CC BY 4.0)" with a
link to https://epoch.ai/data/ai-data-centers.

## Reporting cut-off

Anchor every figure to the Epoch "last updated" date recorded in
`story.yaml`'s `data_cutoff`. Epoch refreshes ~weekly; the live
`/ai-data-centers` explorer is the current view, this story is a frozen
snapshot. Re-cite the cut-off on each section.
