# SpaceX S-1 · image generation briefs

The deck format treats images as foreground vizslots (`type: image`), composited over the page-level aura background. They need to read at small sizes (44% column width on desktop, full-width on mobile) and **avoid clashing with the orbital-blue aura** behind them. Brief is therefore: high-contrast, deep blacks, restrained palette (orbital blue / amber / off-white), no busy backgrounds.

Three slots reference images; one is optional. Prompts are written for Midjourney / Flux-Pro / Imagen 4 — adjust syntax to your model.

---

## 01 · Hero — cover slide (required)

**Slot:** `cover.foreground[0]` · right column · 46% × 76vh
**File:** `01-hero-orbital.webp` (4096×3072 source, export 1920×2880 webp Q85)
**Aspect:** portrait, 3:4

> Cinematic editorial photograph of a Falcon 9 first stage descending through Earth's upper atmosphere at dusk, viewed from low-Earth orbit. Beneath it, the curvature of the Earth glowing with city lights along terminator. Faint linear streaks of a Starlink constellation arc tracing the horizon. Deep navy and obsidian palette with a single warm-amber plume on the descending booster. Dramatic chiaroscuro, sharp engineering detail on the booster grid fins, slight atmospheric haze. Shot on Hasselblad H6D, 50mm, long exposure, archival print quality. No people, no logos, no text. Wide negative space top-left for headline overlay.

**Negative prompt:** logo, text, watermark, cartoon, illustration, daylight, blue sky, generic stock photo, lens flare cliché, sparkles

**Alt text:** *Falcon stage-one re-entry plume over a Starlink constellation arc, deep dusk*

---

## 02 · COLOSSUS data centre — AI black hole slide (required)

**Slot:** `ai-black-hole.foreground[0]` · left column · 44% × 60vh
**File:** `02-colossus-data-center.webp` (3840×2400 source, export 1600×1100 webp Q85)
**Aspect:** landscape, 16:11

> Editorial architectural photograph inside a hyperscale AI training facility. A single perspective corridor between two endless rows of liquid-cooled GPU server racks receding into vanishing point. Cyan and warm-amber LED status lights punctuate the symmetry. Reflective polished concrete floor doubling the rack lines. Suspended cable trays overhead carrying optical interconnect. Cold, clinical, awe-inspiring scale. No humans. Industrial monochrome — graphite, steel, with cyan-amber LED accents only. Long exposure feel, perfectly straight lines, leading symmetry. Photorealistic, archival quality. Suggestive of Memphis, Tennessee location: large clear-span industrial volume.

**Negative prompt:** people, faces, logos, branding, signage text, datacenter generic stock photo, server rack stickers

**Alt text:** *Inside COLOSSUS — gigawatt-scale AI training cluster, Memphis*

---

## 03 · Starlink constellation — Starlink prose slide (optional, used if `starlink-machine` adopts split layout)

**Slot:** `starlink-machine.foreground[1]` (currently not referenced; available)
**File:** `03-starlink-constellation.webp` (3000×3000 source, export 1400×1400 webp Q85)
**Aspect:** square, 1:1

> Astrophotography composite showing the Starlink constellation as seen from a long-exposure ground perspective at a dark-sky site. A dense grid of parallel satellite light trails crosses a moonless desert sky, each trail razor-thin, evenly spaced, suggesting an engineered lattice rather than chaos. Below the trail field: silhouetted ridge of distant mountains, suggesting Patagonia or the Atacama. Cool indigo gradient sky, no light pollution. Subtle Milky Way band perpendicular to the satellite trails, partly occluded. Quiet, scientific, slightly ominous. Long exposure, 30-min stack, telescope tracking off. Photorealistic, archival.

**Negative prompt:** people, vehicles, buildings, telescopes, conspiracy framing, dramatic clouds

**Alt text:** *Starlink satellite trails over a dark-sky site — long exposure*

---

## 04 · Governance · founder portrait (optional alternative; **author discretion**)

**Slot:** could replace `governance.foreground[1]` chart in an editorial variant
**File:** `04-governance-iconography.webp`
**Aspect:** landscape, 3:2

> NOT a portrait. Conceptual editorial illustration of corporate governance concentration: two transparent geometric volumes — one tall and narrow representing Class B / voting power, one short and wide representing Class A / economic equity — backlit from below with thin orbital-blue light, casting interlocking shadows on a dark graphite plane. The tall volume's shadow consumes the wider one. Architectural-rendering aesthetic. No people, no flags, no Tesla / SpaceX iconography. Style cue: monolithic, Brutalist financial illustration in the manner of Christoph Niemann × Erik Spiekermann.

**Negative prompt:** Elon Musk likeness, any person, any face, recognisable brand mark, rocket, satellite

**Alt text:** *Class A vs Class B share structure — geometric volumes*

> ⚠️ Avoid generating any depiction of a named individual. The story is about governance structure, not personality.

---

## 05 · Cover bottom-strip — Starlink V3 / Starship pairing (optional)

**Slot:** could anchor an interstitial divider between sections 7 and 8
**File:** `05-starship-v3-pairing.webp`
**Aspect:** ultrawide, 21:9

> Editorial cross-section illustration: Starship payload bay open in low-Earth orbit, deploying a stack of flat V3 Starlink satellites in a fan pattern. Each satellite a thin matte-black rectangle with cyan solar wings beginning to unfold. Earth horizon curves at the bottom edge, deep ocean blue. Background: black space, scattering of stars. Diagrammatic but photorealistic. Technical, scaled, no humans, no logos. Suggestive of NASA archival deployment photography.

**Negative prompt:** cartoon, anime, neon hyperreal, fake stars overlay, fictional spacecraft

**Alt text:** *Starship deploying V3 Starlink satellites — orbital cross-section*

---

## Generation notes

- **Master palette anchors:** `#070a14` (space black), `#4ea8ff` (orbital blue, accent), `#71ECFF` (signal cyan, Starlink), `#f4b942` (amber), `#eef1f8` (text). Tell the model these are *allowed*; everything else should be desaturated.
- **Mood ladder:** scientific → architectural → financial. Avoid sci-fi / neon / cinematic-trailer aesthetics. The deck is corporate-investor reading.
- **Export pipeline:** SDXL/Flux at 1.5× target size, downscale with Lanczos, encode webp Q85. Keep PNG fallback at 1× for accessibility.
- **Where existing public-domain imagery is sufficient:** SpaceX media library (https://www.spacex.com/media) and NASA Image Library (https://images.nasa.gov) carry usable Falcon 9 / Dragon / Starship test photography under their respective licences. Cross-check the licence on each asset before publishing — much of the SpaceX library is "for editorial use, attribution required".
