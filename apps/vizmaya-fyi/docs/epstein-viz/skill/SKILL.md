---
name: epstein-viz
description: >
  Context and guidance for the Epstein Document Visualization project — a geospatial intelligence
  tool that ingests official government documents (DOJ, FBI, House Oversight) and renders
  interactive map-based stories by extracting locations, people, and events via LLM NER, then
  clustering them into substories.

  Use this skill whenever the user mentions: Epstein documents or data, the DOJ/FBI/House
  Oversight ingest pipeline, entity extraction from legal documents, NER for locations/people/
  events, the map visualization, substories, geocoding, the Epstein project, or asks about
  progress/status/next steps on this project. Also trigger for questions about the data sources
  (justice.gov/epstein, vault.fbi.gov, oversight.house.gov), the Claude NER pipeline, the
  pgvector setup, Deck.gl map, or the Louvain substory graph. When in doubt, trigger — this
  project has many moving parts and context helps.
---

# Epstein Document Visualization

## First: Check Project Status

Before responding, read the project tracker at:
`/Users/suprabhodhenki/Documents/Promad/Experiments/vizmaya-fyi/docs/epstein-viz/PROJECT.md`

This file contains:
- Current phase completion status
- Open questions
- Architecture decisions already made
- Entity schemas

Use it to give accurate, up-to-date answers rather than re-deriving from scratch.

---

## Project Summary

A pipeline that turns 3.5M+ pages of official Epstein-related government documents into an
interactive map with three visualization layers:

1. **Locations** — how often mentioned and by whom
2. **People** — mapped to their associated geography (e.g. Trump → USA, MBS → Saudi Arabia)
3. **Events** — mapped to where they occurred (e.g. 2008 crash → New York)

These are grouped into **substories** — narrative clusters of co-occurring people/places/events,
auto-generated via graph community detection + LLM summarization.

---

## Pipeline Phases

| Phase | What it does |
|-------|-------------|
| 1. Ingest | Crawl DOJ/FBI/Oversight, download PDFs/images, extract + chunk text |
| 2. NER | Claude structured extraction of locations, people, events per chunk |
| 3. Resolve | Deduplicate entities, geocode locations, link people to geography via Wikidata |
| 4. Substory Graph | Build co-occurrence graph, run Louvain clustering, LLM-title each cluster |
| 5. Map UI | Deck.gl + Mapbox with heatmap, point markers, timeline slider, substory sidebar |

---

## Data Sources

- **DOJ**: https://www.justice.gov/epstein (primary corpus, ~3.5M pages)
- **House Oversight**: https://oversight.house.gov (~53,000 pages)
- **FBI Vault**: https://vault.fbi.gov/jeffrey-epstein (22 FOIA parts)

---

## Tech Stack

```
Node.js ingest → pdf-parse / Tesseract.js → Claude NER → Nominatim geocoding
→ Postgres + pgvector → graphology (Louvain) → Deck.gl + Mapbox → Next.js
```

---

## NER Extraction Format

When helping design or debug the NER prompt, this is the target structured output:

```json
{
  "locations": [{ "name": "", "context": "", "mentioned_by": "" }],
  "people": [{ "name": "", "role": "", "associated_location": "" }],
  "events": [{ "name": "", "date": "", "location": "", "description": "" }]
}
```

Chunks are ~2,000 tokens. Results are cached by chunk hash to avoid re-processing.

---

## Key Principles

- **Start small**: validate full pipeline on 100 docs before scaling to millions
- **Cache aggressively**: NER is expensive — hash-based cache is non-negotiable
- **Substories are the differentiator**: pure maps exist; narrative clustering doesn't
- **People → location resolution**: use Wikidata first, fall back to LLM inference for minor figures
- The existing `supro/ingest-pipeline` branch is the foundation — build on it

---

## When Helping with This Project

- **Progress questions** → read PROJECT.md, report phase status accurately
- **Architecture questions** → refer to the established tech stack above; don't suggest alternatives unless there's a clear problem
- **NER quality issues** → think about prompt design: system prompt framing, few-shot examples, output validation
- **Substory quality** → think about graph edge weight thresholds and LLM summarization prompts
- **Scaling concerns** → address storage (pgvector costs), rate limits (DOJ scraping ToS), and OCR throughput
- **New phases** → update PROJECT.md milestone status when work completes

Always update PROJECT.md when the user reports completing tasks or making decisions, so the tracker stays accurate.
