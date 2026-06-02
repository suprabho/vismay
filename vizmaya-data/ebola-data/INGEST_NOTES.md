# Ebola 2026 — ingest notes

Source-of-record for each file, per-figure provenance, and the gotchas the
WHO/CDC/ECDC scrape phase surfaced.

## `ebola_outbreaks_history.csv`

**Primary source:** US CDC Outbreak History page
(`https://www.cdc.gov/ebola/outbreaks/index.html`, last reviewed
15 Dec 2025, fetched 29 May 2026 via `mcp__workspace__web_fetch`).

**Augmenting sources for the West Africa 2014–2016 country-level split:**
The CDC page reports the West Africa epidemic as a combined entity
("Guinea, Liberia, Sierra Leone — 28,610 cases, 11,308 deaths"). The
per-country split used here matches WHO's final West Africa situation
report and CDC/MMWR 65(SU03) figures:

- Sierra Leone — 14,124 / 3,956
- Liberia — 10,678 / 4,810
- Guinea — 3,814 / 2,544

Sum = 28,616 cases (within 6 of the CDC combined figure — discrepancies
are reporting-cut-off artefacts). 2,544 + 4,810 + 3,956 = 11,310 (within 2
of the CDC combined deaths figure). Both totals round to the CDC
top-line.

**2026 row** (DRC, Ituri/N. Kivu/S. Kivu, Bundibugyo): figures pulled
from the WHO DG opening remarks 20 May 2026 + WHO DON 2026-DON603
(21 May report) + DRC MoH 26 May report cited by WHO. Marked `cases=121`
and `deaths=17` for DRC, `cases=7` and `deaths=1` for Uganda. These are
**confirmed only**. Suspected counts (1,077 / 238) live in
`drc_2026_health_zones.csv` and in `REPORT.md`.

### Per-country totals (sanity check)

| Country | Outbreaks counted | Cases sum | Deaths sum |
|---|---:|---:|---:|
| DRC | 17 | ~4,913 | ~3,025 |
| Sierra Leone | 1 | 14,124 | 3,956 |
| Liberia | 1 | 10,678 | 4,810 |
| Guinea | 2 | 3,837 | 2,556 |
| Uganda | 8 | ~770 | ~330 |
| Sudan / S. Sudan | 4 | 335 | 180 |
| Gabon | 5 | 268 | 175 |
| R. of Congo | 4 | 249 | 211 |
| Nigeria | 1 | 20 | 8 |

These are the numbers `charts/countries.json` plots. The DRC total
includes the 2026 outbreak in progress.

### Gotchas

1. **Lab-confirmed-only flags.** CDC's 2012 rows for the Uganda Kibaale,
   Uganda Luwero/Jinja/Nakasongola, and DRC Isiro outbreaks are noted as
   "lab-confirmed cases only" — true case counts including probable
   cases were higher. Captured in the `notes` column.
2. **2018–2020 DRC Kivu epidemic.** CDC reports 3,470 cases / 2,287
   deaths. The DRC MoH final tally via WHO was 3,481 cases (3,323
   confirmed + 158 probable) / 2,299 deaths. The CSV uses CDC's number
   for consistency with the rest of the table; the alternate figure is
   noted in `REPORT.md`.
3. **2014 DRC Boende outbreak.** Often confused with the West Africa
   epidemic. Sequencing showed it was a separate spillover related to
   the 1995 Kikwit variant. Captured in the `notes` column.
4. **Reston rows have `cfr_pct = 0`** because Reston is asymptomatic in
   humans — not because no one died (no one got sick at all).
5. **Russian lab cases (1996, 2004)** are kept because CDC keeps them,
   even though they are accidents, not field events.
6. **2022 DRC Beni single-case event.** CDC labels this DRC's 15th
   outbreak; some sources fold it into the 2018–2020 tally. Kept as a
   separate row.

## `drc_2026_health_zones.csv`

**Primary source:** DRC Ministry of Public Health daily reports
(forwarded through WHO DON 2026-DON603 and Africa CDC situation
reports), plus Wikipedia's running tally cross-checked against ECDC.

**Cut-off:** 26 May 2026.

| Field | Source |
|---|---|
| Rwampara `confirmed_cases=32`, `contacts=621` | WHO + Africa CDC sit-rep, 24 May |
| Bunia `confirmed_cases=24` | Same |
| Mongbwalu `confirmed_cases=19` | Same |
| TOTAL_DRC `confirmed=121`, `deaths=17`, `suspected=1077`, suspected deaths 238 | DRC MoH 26 May via WHO |
| Uganda Kampala `confirmed=7`, `deaths=1` | Uganda MoH via WHO |

**Gotchas:**

1. **The numbers don't reconcile cleanly.** Rwampara 32 + Bunia 24 +
   Mongbwalu 19 = 75 — short of the 121 DRC confirmed total. The
   residual ~46 is split across other Ituri health zones (Nyakunde and
   smaller clusters) plus the imported cases in North Kivu and South
   Kivu. WHO has not published the per-zone breakdown for the residual.
   `health-zones.json` plots an editorial estimate of 10 cases for
   "Other Ituri zones" rather than try to attribute the full residual.
2. **Listed contacts ≠ traced contacts.** Tedros has flagged publicly
   that only a small fraction of Rwampara's 621 listed contacts were
   actively under follow-up because of the security situation.
3. **The Tshopo import into South Kivu** is mentioned in WHO situational
   reporting but no case count was published — left blank.

## `timeline_2026.csv`

**Primary source:** WHO DON 2026-DON602 (16 May) and 2026-DON603 (21 May),
WHO PHEIC declaration item (17 May), WHO DG opening remarks (20 May),
ECDC outbreak page (21 May update), CDC HAN 530, NPR (24 + 27 May).

| Field | Source per event |
|---|---|
| 2026-04-24 estimated index onset | WHO DON603 (back-calculated) |
| 2026-05-05 WHO alert + 4 HCW deaths | WHO DON602 |
| 2026-05-15 INRB confirmation | CDC situation summary |
| 2026-05-15 DRC declaration | WHO |
| 2026-05-15 Uganda imported case (death) | CDC |
| 2026-05-16 second Kampala case | WHO |
| 2026-05-17 PHEIC | WHO news item |
| 2026-05-17 American physician evac to Germany | WHO DON603 |
| 2026-05-18 Africa CDC PHECS | ECDC |
| 2026-05-18 US Title-42-style entry restrictions | Press |
| 2026-05-18 ECDC EU Health Task Force | ECDC press release |
| 2026-05-19 IHR Emergency Committee first meeting | WHO |
| 2026-05-20 DG briefing: 51 + 2 confirmed; ~600 suspected | WHO speech |
| 2026-05-21 IHR temp recommendations | WHO |
| 2026-05-21 85 confirmed; 746 suspected | WHO DON603 |
| 2026-05-24 101 confirmed; 930 suspected | NPR (citing DRC MoH) |
| 2026-05-26 121 + 7 confirmed; 1077 suspected | DRC MoH via WHO |

**Gotcha:** the 4-week gap between the back-calculated index onset and
the lab confirmation is itself a story element — referenced in
`REPORT.md` and the `growth.json` `_meta.note`.

## `by_species.csv`

Aggregated from `ebola_outbreaks_history.csv` plus CDC's species
write-ups. Vaccine / treatment status checked against WHO's May 2026
SAGE briefing and the FDA / EMA labels:

- Zaire — Ervebo (rVSV-ZEBOV) licensed; Inmazeb (atoltivimab/maftivimab/
  odesivimab-ebgn) and Ebanga (ansuvimab-zykl) licensed.
- Sudan — no licensed product; SUDV ring-vaccination trial deployed in
  the 2025 Kampala outbreak.
- Bundibugyo — **no licensed product**. Trial candidates: Oxford / Serum
  Institute of India ChAdOx1-BDBV; Moderna mRNA; IAVI VSV; MBP134 mAb;
  remdesivir.

**Cumulative cases by species** are rounded ("~46,000", "~672", "~290+")
to flag that the underlying totals are approximate at the +/- 50 level
(due to suspected reclassification and the West Africa case-count
discrepancies).

## `genomic_2026.csv`

**Primary source:** virological.org post "Initial genomes from May 2026
Bundibugyo Virus Disease Outbreak in the Democratic Republic of the
Congo and Uganda" (post 1032). Cross-referenced against the Science
Media Centre expert reaction and Nextstrain's `nextstrain/ebola` repo
build manifest.

| Field | Source |
|---|---|
| 37 total genomes in build | virological.org |
| 3 new 2026 genomes | virological.org |
| 34 prior BDBV genomes (2007 + 2012) | Nextstrain |
| INRB DRC + UVRI Uganda | Sequencing institutions |
| Clusters together, distinct from 2007/2012 | Phylogenetic analysis |
| New zoonotic spillover interpretation | Science Media Centre |

**Gotcha:** the ~22 / ~12 split between 2007 Uganda and 2012 DRC in the
`genome-timeline.json` series points is an editorial estimate. The
virological.org post says "34 existing genomes" total without breaking
them out; the 22/12 split is consistent with the Wamala et al. (2010,
PLoS) sample sizes for 2007 Uganda and the Maganga et al. coverage of
2012 DRC. Treat the per-year-position coordinates as illustrative
scatter, not literal sample IDs.

## Source-page incompleteness flags

- **WHO DON603** lists DRC totals at 21 May; the 26 May numbers come
  from the DRC MoH directly (cited by WHO but not yet re-published in a
  DON at the time of writing).
- **Africa CDC's published situation reports** for this outbreak are
  one-week-lagged behind the WHO DON.
- **Wikipedia's running tally** (`2026_Ituri_Province_Ebola_epidemic`)
  was used as a cross-check but is not authoritative on its own.
- **WHO AFRO weekly bulletin** PDFs for the May 2026 weeks were not
  parsed at line-item level; the WHO DON figures supersede them.

## Refresh cadence

The 2026 outbreak is active. A weekly cadence is reasonable:

- **Tuesday:** check for a new WHO DON in the 2026-DON series.
- **Thursday:** check WHO AFRO weekly bulletin (PDF) and Africa CDC.
- **Friday:** ECDC CDTR.

Append to `timeline_2026.csv`, update `drc_2026_health_zones.csv`,
append a datapoint to `charts/growth.json`, bump `data_cutoff` in
`story.yaml` and `_meta.data_cutoff` in the affected chart files.
