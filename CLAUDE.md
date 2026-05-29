# CLAUDE.md — Project scope

## What this project is

A **public-health data visualization story** for Vizmaya.fyi covering the
May 2026 Bundibugyo virus disease (BVD) outbreak in DRC and Uganda.

This is **surveillance journalism**, not virology research. The deliverable
is editorial HTML, Markdown, CSV and JSON — a data story for general
readers, built from official outbreak reports.

## Sources (the only ones to use)

All content must trace to one of:

- **WHO Disease Outbreak News (DON)** — https://www.who.int/emergencies/disease-outbreak-news
- **WHO AFRO weekly bulletin** — https://www.afro.who.int/health-topics/disease-outbreaks/outbreaks-and-other-emergencies-updates
- **US CDC outbreak history + situation summary** — https://www.cdc.gov/ebola/
- **ECDC Communicable Disease Threats Report (CDTR)** — https://www.ecdc.europa.eu/
- **Africa CDC weekly event-based surveillance** — https://africacdc.org/
- **HDX (OCHA) historical CSVs** — https://data.humdata.org/ebola
- **Nextstrain BDBV build** — https://nextstrain.org/
- **Curated academic GitHub repos** (cmrivers/ebola, andersen-lab/ebola-drc-epidemiology)
- **ReliefWeb situation reports** — https://reliefweb.int/

If a fact is not in one of those, it does not go in.

## What's in scope

- Case counts, death counts, CFR by country, province, health zone, species
- Timeline of reporting events (PHEIC declarations, lab confirmations)
- Public statements by WHO / CDC / Africa CDC / national MoH
- Vaccine / therapeutic licensing status (which products are licensed for which species)
- Phylogenetic / lineage findings as published by Nextstrain or peer-reviewed sources
- Response logistics (contact tracing, vaccination campaigns, border screening)
- Data accessibility — formats, APIs, scraping caveats for builders

## What's out of scope

- Viral genome engineering, gain-of-function, dual-use research of concern
- Pathogen synthesis routes, culture protocols, BSL handling procedures
- Mechanism-of-action questions about therapeutics (we report *what* is licensed, not *how* it works at the molecular level)
- Speculation about deliberate release, bioterrorism scenarios
- Clinical advice ("should this person be vaccinated", "what should a clinician do")
- Predictive epidemiological modelling beyond what published sources state

If a request touches these, push back and ask for re-scoping.

## Repo conventions

- Data in `data/*.csv`. Each CSV has a header row and an entity per row.
- Chart configs in `charts/*.json` as ECharts option objects (matching the
  pattern used elsewhere in the monorepo).
- The story manifest is `story.yaml` — section order, data refs, chart refs.
- The longform write-up is `REPORT.md`.
- The standalone HTML viewer is `index.html` (CDN-loaded Tailwind +
  Phosphor + Chart.js, for quick preview without the monorepo).
- Cite sources inline. Every numerical claim should map to a source URL.

## Style

- Inter for UI, Fraunces for editorial, JetBrains Mono for figures.
- Palette: paper `#f5f1ea`, ink `#0f0e0c`, rule `#d8d2c5`, accent `#c4391c`,
  muted `#6b665d`. Species: Zaire `#6a1818`, Sudan `#5c4ba0`, Bundibugyo
  `#c4391c`, Taï `#2d6a4f`, Reston `#6b665d`.
- Sober tone. Avoid drama. Numbers carry the story; the prose explains the
  picture and flags what's uncertain.

## Reporting cut-off

All figures in this repo are anchored to **26–27 May 2026**. Re-cite the
cut-off date on every section so readers know what they're looking at.
Note that suspected → confirmed reclassification produces downward
revisions over time; that is not a bug.
