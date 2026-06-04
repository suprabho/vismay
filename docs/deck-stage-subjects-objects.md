# Deck stage — subjects & objects (a 3-tier model)

**Status:** design exploration (captured from discussion) · nothing built yet
**Relates to:** [`deck-layouts-de-hardcode.md`](deck-layouts-de-hardcode.md) (the vizslot tier) · [`roadmap-june-2026.md`](roadmap-june-2026.md) (Tier 1 fit)
**Generated:** June 4, 2026

---

## TL;DR

Evolve the Deck format from a 2-tier model (background + foreground vizslots) into a **3-tier
"stage"**: **background · vizslots (which *cut* between beats) · a new Subjects & Objects tier** of
persistent entities that live in their own flow across beats. This dissolves the hard "matched-layer
morph between two slide DOMs" problem by making continuity a **first-class entity** rather than an
inference — and it's *friendlier* to deterministic video/PDF capture, not harder. The kicker: **the
map module is already exactly this pattern**, so Tier 1 is a generalization of an existing mechanic,
not a new engine.

---

## The model

Three z-tiers instead of two:

1. **Background** — the persistent backdrop (map / aura). Exists today.
2. **Vizslots (the beat composition)** — the per-beat grid of content. **These cut; they don't tween.**
   Each beat is a clean composed frame. (This is the tier the layout-affordance work improves.)
3. **Subjects & Objects (new)** — persistent entities that live in *their own flow*, independent of
   the beat grid. They are the things that actually move/morph across beats.

Advancing a beat is a **cue** that retargets everyone: the set (vizslots) cuts to the next shot; the
cast and props (subjects/objects) are continuous across shots. It's a theater / scene-graph model.

### Subject vs Object
- **Subject** — *center stage*. The focal actor a beat is "about"; gets the morph/continuity, can take
  z-focus (step in front of content), and is **interactive/responsive** (you can grab/scrub it).
- **Object** — *decor*. Ambient set-dressing that persists and drifts (e.g. the starship cruising
  through the SpaceX story). Non-interactive.

Both have **lifetime tracks** — they enter and exit over a beat range (a subject flies in at beat 3,
gone by beat 9), with a per-beat **state track** (position / size / opacity / rotation / z) that
interpolates on beat change.

## Why this beats id-matched layers

The earlier idea was "matched layers": a layer with the same `id` in consecutive slides morphs between
its two states. That's fragile — it means morphing between two independent slide DOMs at different
scroll offsets. Making continuity a **first-class staged entity** removes the fragility: the morphing
thing was never part of a slide. And because subjects have explicit per-beat states, the timeline is
**fully determined** — which is exactly what deterministic video/PDF capture needs. (The free-morph
approach was the thing that *fought* capture; this one doesn't.)

## The map is the prototype

The map module is already a persistent instance that flows across beats: one Mapbox context for the
whole story, an array of per-beat camera configs, and `activeUnit` drives a `flyTo` interpolation
between them (`mountingMode: 'persistent-aggregated'`, `packages/viz-engine/src/modules/map/index.ts`
+ `BackgroundVizSlot`). That **is** the subject pattern — single entity, own lifetime, per-beat target
states, interpolated while slide content cuts. Subjects/objects = promote that mechanic from a quirk
of one module into a first-class authorable tier any entity can live in.

## The cost cliff (3D)

Two very different dreams wear the word "3D", ~4–5× apart in cost:

- **(A) Real 3D *content* on a fixed-z stage** — subjects are genuine 3D (the starship turns, catches
  light, parallaxes; the camera orbits) but the 3D *canvas* sits at a fixed z-band relative to the DOM
  vizslots. Depth happens *within* the canvas, not *between* a 3D object and the HTML text.
- **(B) True z-traversal through the content plane** — a subject flies *behind this headline and in
  front of that chart* as actual depth.

The hard truth: **a WebGL canvas is a single DOM layer.** You can't pixel-depth-interleave one object
between two sibling HTML elements. Real (B) means rendering text into the 3D scene (losing crisp DOM
text + interactivity + a11y), stacked canvases with occluder proxies (fragile vs responsive reflow),
or CSS-3D compositing (an engine). On flat screens with DOM content, **(A) is the sane target and
already ~80% of "amazeballs."**

**z-traversal-lite:** split the DOM into a content-behind band and a content-front band with the 3D
canvas between them. A subject is authored per-beat as "behind" or "in front," and crosses the plane
on the beat where it transitions. On a flat screen that reads as moving *through* depth — without any
pixel-depth interleaving. ~10% more than fixed-z, most of the wow.

## The "spread out" cost — surface by surface

| Surface | Cost |
|---|---|
| **Live web scroll** | New persistent r3f/three canvas tier (a client island, like starship today); beats → camera/entity interpolation. Moderate. |
| **Autoplay** | Same scene, timeline-driven instead of scroll. Cheap once the beat-state model exists. |
| **Video capture** | The real tax — the tween must be deterministic & seekable ("be at beat N's state at time T") and hook the readiness machinery (GLB loaded → first frame → settle). The map already does this dance. |
| **PDF / print** | Each beat = a still of the stage at that beat's state; needs the `__pdfReady__` gate to wait on model load + a painted frame. |
| **Mobile / portrait** | The expensive surface — three + Mapbox + ECharts on a phone is GPU/memory/battery pressure. Likely needs a degrade path (objects → 2D sprites / fewer objects under reduced-motion). |
| **Admin authoring** | The biggest hidden cost — per-beat 3D camera + transforms is a different editor than 2D boxes. Start with numeric/YAML authoring; defer a visual 3D editor or it balloons. |
| **SSG + assets** | Stage is client-only (no SSR — fine, starship already is). GLB assets need optimization (draco), loading states, the `assets://` pipeline. |

The pattern: the renderer is the fun part; the tax is **determinism (capture) + authoring + mobile
degradation**. The map having already solved persistence-+-capture makes this a generalization.

## Effort tiers

1. **Subjects/objects as a tier, 2D screen-space persistence** — smallest. "The map pattern,
   generalized to any layer." Continuity + subject/object distinction + lifetime tracks, flat.
2. **+ Fixed-z 3D stage** (real models, camera, parallax) — meaningfully larger: persistent 3D canvas,
   per-beat transform tracks, capture hooks, mobile degrade.
3. **+ z-traversal-lite** (2 DOM bands) — small delta on top of 2.
4. **True z-interleave (B)** — the cliff: a compositing + authoring engine. **Park indefinitely.**

**Recommendation:** Tier 1 as the foundation, then 2+3 — and design the data model **3D-ready from
day one** (subjects in a shared coordinate space with per-beat transform tracks) so Tier 4 isn't
foreclosed, but don't build it until something forces it. **Tier 1 is the June candidate** (see the
roadmap).

## Decisions captured (from discussion)
- 3D space is the goal, but cost-aware — fixed-z bands first, designed traversal-ready.
- "z fixed" is the practical truth (every consumption surface is flat); z-axis traversal is the dream
  → resolved via fixed-z + z-traversal-lite, not true interleave.
- Subjects are interactive/responsive; objects are not.
- Subjects/objects have explicit enter/exit lifetimes.

## Open questions
- Is the **starship** a *subject* (grabbable, the focus of those beats) or an *object* (ambient drift)?
- Authoring: per-beat transforms in **YAML** (like the map's camera today) vs eventually a **visual 3D
  editor** in the admin canvas — the difference between "ambitious feature" and "we built a 3D editor."

---

*Captured June 4, 2026 from a design conversation. No implementation yet; Tier 1 is scoped into the
June roadmap as a ④ Deck extension.*
