# Vismay — slide deck

> Each slide = title + dek + body. Speaker notes in *italics*. Arc: manifesto → model → process → portfolio → engine → proof → invitation.

---

## Slide 1 — Title

# Vismay
### A studio for human-built IP on a reclaimed internet.

Supro · 2026

*Open warm. This isn't a pitch for a product. It's a thesis about what to build in the next decade and who to build it with.*

---

## Slide 2 — Why now

### The internet stopped being ours

- Distribution is owned by a few feudal techlords
- Every feed is algorithm-shaped, optimizing for something other than you
- AI is eating the parts of work that were never the point
- The opposite move — slow, human, named, obsessed with one thing — is suddenly available again

*The conditions for this kind of work haven't been this good in fifteen years. Most people haven't noticed yet.*

---

## Slide 3 — The thesis

### Reclaim a piece of the internet by building IP with people who actually care

> Pair a friend who has a real, durable obsession in a domain
> with a shared engine that handles everything below the craft.
> Build the brand together, for the long run.

*This is the whole deck in one sentence. Everything else is mechanics and proof.*

---

## Slide 4 — The deal

### Partner brings taste. I bring the engine.

| The partner | Vismay |
|---|---|
| Voice, taste, obsession | Engine, ingest, render pipelines |
| Editorial direction | Production value of a major publication |
| Owns the brand and the community | Time horizon and infrastructure |

**They grow the IP. I grow with them.** That's what success looks like to me.

*Not a vendor relationship, not an agency engagement. Co-ownership of a long-running thing.*

---

## Slide 5 — The repeatable process

### Same pipeline for every IP

```
INTERNET ──▶ Scraping & tagging ──▶ Storage ──▶ Human ──▶ Engine ──▶ Surfaces
existing data     (domain-tuned)    (Supabase)  instructions          scrollytelling
new / news                                       format               dashboards
                                                 editorial voice      social assets
```

- **Ingest** is the only thing that changes per IP
- **Storage**, **engine**, and **surfaces** are shared infrastructure
- The partner lives in the **human** layer — instructions, format, voice — and never has to touch code

*This diagram is the reason I can run more than one IP. Without it, every brand needs its own dev team.*

---

## Slide 6 — Portfolio: live

### Two IPs running today

- **vizmaya.fyi** — geopolitics, economics, technology *(Supro)*
- **Footshort** — football *(Supro)*

*Started with the two I could run alone, to harden the engine on real production load before bringing partners in.*

---

## Slide 7 — Portfolio: in production & in pipeline

### The next wave is partner-led

**In production**
- **Kidzovo** — kids
- **Protrip** — travel
- **F1** — *with Rohit*
- **Enterprise & Finance** — *with Shashank*

**In pipeline**
- **Skincare + beauty** — *with Vanshika*
- **Fashion + styling** — *with Vanshika*
- **Music & events** — *with Retro Blxxd*

*Each partner owns their domain. The variety is the point — once the engine carries it, breadth costs almost nothing.*

---

## Slide 8 — Portfolio: on the bench

### Domains I want to do, partner pending

Architecture · Cricket *(Sachin / Shubham)* · Spirituality *(Rohit)* · Art · Entertainment · Food & recipe · Science / space · Pets · Manufacturing in India *(Padma)*

*Some of these have a person attached but no start date. The rest are open invitations to the right person.*

---

## Slide 9 — The engine

### `@vismay/viz-engine` — one runtime, three persistent layers

```
TEXT CARDS (snap-locked)
    │
    ├── drives ──▶ ForegroundVizSlot  (ECharts)
    └── drives ──▶ BackgroundVizSlot  (Mapbox GL, persistent)
```

- A story is **markdown + YAML + chart JSON** — never code
- A **module registry** dispatches each unit; verticals plug in as tree-shaken bundles
- Three render pipelines: **autoplay MP4**, **PDF (report + slides)**, **TTS audio**
- Edit in `/admin` without redeploying

Stack: Next.js 16 · React 19 · Supabase · Mapbox GL · ECharts · GSAP · Rive · Playwright · Gemini

*The technical depth here is what lets the partner stay in their craft. They never see it.*

---

## Slide 10 — Proof: vizmaya.fyi

### 17+ live stories. One engine.

*Currency rankings 2026 · Who owns America's debt · Projected population 2050 · World Cup 2026 atlas · India fuel prices · South Korea GPU-hour economics · European AI adoption · Prediction markets illusion · The Great Nicobar project · Press freedom 2026 · …*

Plus **epics** — `/energy-profile` (daily IEA news ingest + 33-country OWID energy data) and `/epstein` (curated story set with a bespoke landing).

*This is what the model produces when it's working. Every story is the same engine; the difference is all in the YAML and the voice.*

---

## Slide 11 — Why this scales without going factory

### Breadth is a feature of the model, not a tradeoff

- The engine carries production value
- The partner carries authenticity
- The pipeline keeps the ingest honest to each domain
- I stay close enough to every IP to keep the taste high

*The opposite of a content farm. Closer to a small label with a shared studio.*

---

## Slide 12 — What's next

### Roadmap

- **Engine** — extract data-bound football components into `@vismay/footshort-viz`; decide on a native React Native engine when mobile editorial usage justifies it
- **IPs** — bring the four in-production partners to first launch
- **Tooling** — admin polish, validation, type-narrowed YAML so partners self-serve more
- **People** — fill the open partner slots on the bench

---

## Slide 13 — Invitation

### Who I'm looking for

- **Friends with a real obsession** in a domain on (or off) the list
- **Collaborators on the engine** — verticals, native rendering, content tooling
- **People who want a piece of the internet back**

**Supro · hello@promad.design**

*Close warm. The ask is genuine — this whole thing only works if the right humans show up.*
