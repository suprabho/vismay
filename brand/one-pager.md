# Vismay

**A studio for human-built IP on a reclaimed internet.**
I partner with friends to build long-term brands around what they're actually passionate about — then a shared engine carries the storytelling, the data, and the distribution.

---

## Why

The internet, digital media, and distribution are owned by a handful of feudal techlords. Almost everything we read or watch is shaped by algorithms optimizing for something other than us. No platform feels truly authentic anymore.

At the same time, AI is taking over the parts of work that were never the point. Which means the moment is right for humans to do the opposite — reconnect with what we actually care about and build on it, slowly, in public, with our names on it.

Vismay is my answer. It's my life's work.

## What it actually is

A small studio model and a shared engine. I pair with a friend who has a real, durable interest in a domain — football, finance, F1, fashion, kids, music, travel, spirituality, food, manufacturing — and we build an IP together. They bring taste, voice, and obsession. I bring the engine, the production pipeline, and the time horizon.

**The deal:** they own the brand and the community. I help them grow it, and I grow with them. For me, that's what success looks like.

## The portfolio

**Live**
- **vizmaya.fyi** — geopolitics, economics, technology *(Supro)*
- **Footshorts** — football *(Supro)*

**In production**
- **Kidzovo** — kids
- **Protrip** — travel
- **F1** *(with Rohit)*
- **Enterprise & Finance** *(with Shashank)*

**In pipeline**
- **Skincare + beauty** *(with Vanshika)*
- **Fashion + styling** *(with Vanshika)*
- **Music & events** *(with Retro Blxxd)*

**On the bench**
Architecture · Cricket *(Sachin / Shubham)* · Spirituality *(Rohit)* · Art · Entertainment · Food & recipe · Science / space · Pets · Manufacturing in India *(Padma)*

## The repeatable model

Every IP runs the same pipeline. That's why this can scale without ever feeling factory-made.

```
INTERNET                 PIPELINE              STORAGE         HUMAN              VISUALIZE        SURFACES
existing data    ──▶  scraping & tagging  ──▶  store    ──▶  instructions  ──▶  engine  ──▶  scrollytelling
new data / news                                              format                            dashboards
                                                             editorial voice                   social assets
```

- **Ingest** — domain-specific scrapers and tagging
- **Store** — Supabase Postgres + storage, one source of truth per IP
- **Author** — the partner sets instructions, voice, and format; markdown + YAML, no code
- **Render** — the engine produces the same story as a scroll page, a dashboard, an autoplay video, a PDF, and social cards

The partner stays inside their craft. Everything below the "human" layer is shared infrastructure.

## The engine

`@vismay/viz-engine` — a registry-based runtime for scroll-driven, three-layer data stories: a persistent map background (Mapbox GL), a chart foreground that transitions without remounting (ECharts), and snap-locked text that drives both. Core modules: map, chart, image, video, embed, rive. Verticals (Footshorts, F1, …) plug in as tree-shaken bundles. Three render pipelines — autoplay MP4, story PDF (report + slides), TTS audio — all dispatched through GitHub Actions in production. Stack: Next.js 16, React 19, Supabase, Mapbox GL, ECharts, GSAP, Rive, Playwright, Gemini.

The point of the engine isn't the tech. It's that every new IP gets the production value of a major publication without having to rebuild it.

## Proof: vizmaya.fyi

17+ live stories on currency rankings, US debt holders, projected population 2050, India fuel prices, Korean GPU economics, European AI adoption, the World Cup 2026 atlas, prediction markets, press freedom, Great Nicobar. Plus epics — `/energy-profile` with daily IEA news ingest and 33-country OWID data; `/epstein` with a curated story set. One engine. Many stories. No two look the same.

## What I'm looking for

Friends with a real obsession in a domain on (or off) the list above. Collaborators on the engine — verticals, native rendering, content tooling. People who want a piece of the internet back.

**Supro · hello@promad.design**
