# Stage timeline & section transitions — refining Tier 1 toward the editor

**Status:** v0 implemented (M0 + M1 + M2-lite, triggered clock only — sub-keyframes, delay/duration stagger, rAF stage renderer, foreground `cut|fade|slide` + background `hold|crossfade`, `revealDelayMs`; `clock: scrubbed`/`runway` and remaining transition kinds are schema-reserved and rejected with clear errors). Scrubbed clock, capture seek bridge, autoplay dwell, and the editor remain future milestones.
**Refines:** [`deck-stage-subjects-objects.md`](deck-stage-subjects-objects.md) (the 3-tier stage, Tier 1 shipped PR #321)
**Relates to:** the freeform video editor (`packages/viz-admin/src/video-project/`, `apps/admin/components/vizmaya/video/`) — the timeline vocabulary and UI this plan converges with
**Generated:** August 20, 2026

---

## TL;DR

Tier 1 shipped the *where*: subjects & objects with sparse beat-keyed poses, densified per unit,
tweened by one global 700 ms CSS transition on beat change. This plan adds the *when*: a
**slide-level timeline** that choreographs stage entities within each beat (per-entity delay,
duration, stagger, multi-step sub-keyframes), driven by a **per-section clock** that is either
**triggered** (land on the slide → a timed choreography plays) or **scrubbed** (scroll progress
through the slide drives the timeline). Alongside it, a **per-section transition vocabulary** ends
the one-size-fits-all hard cut: each section declares how its foreground enters (`cut | fade |
slide | scale | wipe | blur`), what the background does at the boundary (`hold | crossfade |
flyTo`), and boundary timing that the stage's enter/exit ramps inherit.

The unifying move: **beat-local normalized time `t ∈ [0, 1]` becomes the single timeline axis.**
Every consumer — live scroll, autoplay, video capture, PDF stills — is just a different *driver*
of `(unit, t)`. That makes "be at beat N's state at time T" a literal sampler API, which is
exactly what deterministic capture needs (the tax the stage doc predicted).

And the editor is no longer deferred as an open question: the admin **already has** a timeline
editor — the freeform video editor's `TimelinePanel`, tracks/clips with `startMs`/`durationMs`,
`EnterExitAnim`, and `ClipRole`s that *explicitly mirror* stage subjects/objects. The
scrollytelling editor is designed here as an evolution of that surface bound to story beats, not
a third animation system.

---

## What exists today (and where it stops)

- **Beats are discrete.** `StoryShell` derives `activeUnit` from an IntersectionObserver over
  snap targets. There is no continuous progress within a slide reaching the stage.
- **One tween fits all.** `StageVizSlot` reads `frames[activeUnit]` and CSS-transitions every
  entity at once: `TWEEN_MS = 700`, per-segment easing, nothing else. No delays, no ordering, no
  stagger, no multi-step motion inside a beat. Capture determinism comes from *snapping* — i.e.
  from not animating at all.
- **`resolveStage` densifies to one settled transform per unit.** The sampler
  (`sampleTrack(resolved, i)`) is already pure and index-based — a good foundation, but its
  domain is integers.
- **Section handoffs are a hard cut** for foreground vizslots (by design in the 3-tier model),
  with a fixed 500 ms opacity/translateY reveal inside `ScrollySection`. The only "transition"
  that varies per story is the map background's `flyTo` — which is, as ever, the prototype.
- **The admin video editor** (`VideoProjectSnapshot`) has tracks, clips on a ms timeline,
  `EnterExitAnim { kind: none|fade|slide|scale, durationMs, easing }` reusing `StageEasing`, a
  `TimelinePanel`/`TimelineClip` UI, and `ClipRole = media|text|object|subject|audio` — the
  comment on `object`/`subject` says "mirrors a stage 'object'/'subject'". The convergence was
  anticipated; this plan cashes it in.

---

## The model

### 1. Beat-local time

Every beat span gets a normalized local timeline `t ∈ [0, 1]`. `t = 0` is the moment the beat
becomes active; `t = 1` is its settled pose (the pose Tier 1 renders today). The stage sampler's
domain widens from `frames[unit]` to `sample(unit, t)`.

Sub-keyframes make multi-step motion authorable — a beat selector grows an optional `t`:

```yaml
keyframes:
  - at: { section: ascent }            # t: 0 implied — the arrival pose is now the START
    transform: { position: { x: -0.6 }, opacity: 0 }
  - at: { section: ascent, t: 0.4 }    # mid-beat pose
    transform: { position: { x: 0.1 }, opacity: 1 }
  - at: { section: ascent, t: 1 }      # settled pose
    transform: { position: { x: 0.2 }, scale: 1.1 }
```

**Back-compat:** a keyframe without `t` keeps today's semantics — it is the beat's settled pose
(`t: 1`), and the tween *into* it starts from the previous beat's settled pose. Existing stage
configs (`_demo-stage`, spacex) resolve identically; nothing re-authors.

### 2. Per-entity timing — delay, duration, stagger

Timing refinements ride on the keyframe (replacing the global `TWEEN_MS`):

```yaml
keyframes:
  - at: { section: ascent }
    delayMs: 300        # wait after beat entry before this segment starts
    durationMs: 900     # segment length (default 700 to match today)
    easing: easeOut
    transform: { ... }
```

`delayMs`/`durationMs` are expressed in ms of the *triggered* clock; under a scrubbed clock they
normalize against the section's `timelineMs` (below), so one authored track serves both clocks.
Stagger is just different `delayMs` per entity — no separate concept needed. A section-level
`stagger` sugar (`stagger: { entities: [a, b, c], stepMs: 120 }`) can compile down to per-entity
delays in the resolver; sugar only, no runtime representation.

### 3. The per-section clock

```yaml
sections:
  - id: ascent
    clock: triggered      # default — snap-deck friendly
    timelineMs: 1600      # length of this beat's choreography (default: max keyframe extent)
  - id: freefall
    clock: scrubbed       # this section trades snapping for scroll runway
    runway: 2.5           # viewports of scroll height; t = progress through the runway
```

- **`triggered`** (default): landing on the beat starts a wall-clock run of `t: 0 → 1` over
  `timelineMs`. Fits the current snap model unchanged. Leaving mid-run retargets — the sampler
  starts the next beat's timeline from the entity's *current* sampled transform, never from a
  hardcoded pose, so fast scrollers see continuous motion, not pops.
- **`scrubbed`**: the section renders taller than a viewport (its snap target becomes the runway's
  start; `scroll-snap-stop` releases within it) and `t` is the reader's progress through the
  runway. True video-editor scrubbing, forward and backward. `StoryShell` computes per-section
  progress from the section element's bounding rect — the machinery is a sibling of the existing
  `viz-story-progress` embed reporting.
- **Autoplay** drives every section as triggered, dwelling `max(timelineMs, ttsMs)` — scrubbed
  sections play through their timeline at `timelineMs` pace. **Capture** seeks: the render
  pipeline asks for `(unit, t)` frames explicitly. **Reduced-motion / snap** is `t = 1`
  immediately — exactly today's snap path, generalized.

### 4. Section transitions

A per-section `transition` block owns the boundary *into* that section (the video-editor
convention: the transition belongs to the incoming clip):

```yaml
sections:
  - id: freefall
    transition:
      foreground: { kind: slide, direction: up, durationMs: 500, easing: easeOut }
      background: crossfade          # 'hold' (default) | 'crossfade' | 'flyTo' (map-owned)
      durationMs: 500                # boundary length; stage enter/exit ramps inherit it
```

- **Foreground** — the vizslot grid still *cuts* (per the 3-tier model: beats are clean composed
  frames, never DOM morphs), but the cut gets a dressed edge: the outgoing composition plays the
  transition out while the incoming plays it in. Vocabulary reuses the video editor's
  `EnterExitAnim` family, extended: `cut | fade | slide(dir) | scale | wipe(dir) | blur`.
  Default `cut` preserves today's behavior. As a cheap granularity win *within* a beat, vizslots
  accept an optional `revealDelayMs` so a beat's slots can stagger in on the same beat-local
  clock — reveal choreography, not motion tracks. Full foreground timeline tracks stay out of
  scope: re-animating slide DOMs is the fragility the 3-tier model exists to avoid.
- **Background** — formalizes what the map already does. `hold` = nothing (today), `crossfade` =
  aura/scene backgrounds blend at the boundary, `flyTo` = delegate to the module's own camera
  interpolation (map). Modules opt in via a capability flag on their registration rather than the
  shell special-casing types.
- **Stage** — entities are continuous by design and *ignore* section transitions, except at their
  lifetime edges: an entity whose `enter`/`exit` falls on the boundary plays its
  `enterTransform`/`exitTransform` ramp with the boundary's `durationMs`/`easing`, so cast
  arrivals sync with the set change.

### 5. The renderer owns the clock now

CSS transitions cannot express delay-per-entity choreography, sub-keyframes, or scrubbing.
`StageVizSlot` v2 becomes a **rAF-driven sampler**: each frame it asks the clock for `(unit, t)`,
samples every entity's track, and writes `transform`/`opacity` directly. One code path serves
live, autoplay, and headless capture (capture just supplies a mechanical clock — "you are at
`(unit, t)`, paint"), which *retires* the live-vs-snap fork instead of growing it. A handful of
entities × one style write per frame is cheap; `will-change` stays.

---

## Schema deltas (summary)

| Where | Addition |
|---|---|
| `BeatSelector` | optional `t?: number` (0..1, beat-local) |
| `StageKeyframe` | `delayMs?`, `durationMs?` (defaults 0 / 700) |
| `SectionConfig` | `clock?: 'triggered' \| 'scrubbed'`, `timelineMs?`, `runway?`, `transition?: SectionTransition` |
| new `SectionTransition` | `foreground?: TransitionSpec`, `background?: 'hold' \| 'crossfade' \| 'flyTo'`, `durationMs?`, `easing?` |
| new `TransitionSpec` | `{ kind: 'cut'\|'fade'\|'slide'\|'scale'\|'wipe'\|'blur', direction?, durationMs?, easing? }` — superset of the video editor's `EnterExitAnim` |
| vizslot layer | `revealDelayMs?` |
| `ResolvedStage` | `frames[unit]` → `sample(unit, t)`; resolver precompiles each entity's per-beat segment list |

`TransitionSpec` should land in a shared location both `video-project/types.ts` and
`storyConfig.types.ts` import, with `EnterExitAnim` re-expressed as its subset — one transition
vocabulary across the story engine and the video editor, which is what makes the editor
convergence honest.

---

## The editor

The end goal of the whole engine: a rich scrollytelling editor with video-editor granularity —
background, foreground, subjects and objects independently animated. The design principle is
**convergence**: one timeline surface (`TimelinePanel`'s lineage), two time axes (a video
project's ms axis; a story's beat axis), shared transform editing (the composer's
`TransformLike` / `FreeTransformLayer` direct manipulation), shared transition vocabulary.

### Layout

- **Preview pane** — the *real* `StoryShell` in an iframe. The editor drives it over a
  postMessage seek bridge (`viz-story-seek { unit, t }` — the sibling of the existing
  `viz-story-progress` outbound message). No parallel preview renderer; what you scrub is what
  ships.
- **Timeline panel** (bottom) — horizontal axis = **beats** (sections/subsections as columns,
  proportional to `timelineMs` / `runway`). Boundary gutters between sections carry a
  **transition chip** (click → transition picker: kind, direction, duration, easing).
  A beat can expand to its local `0..1` lane for fine work.
  - **Rows**: one per stage entity (subject rows styled distinct from object rows), a background
    row (transition chips + module camera keyframes where the module exposes them, e.g. map),
    and a foreground row per beat showing slot reveal staggers.
  - **Entity spans** = lifetimes (enter → exit), draggable at the edges — precisely
    `TimelineClip` with beats instead of ms. **Diamonds** = keyframes; drag across beats to
    retime, drag within an expanded beat to move `t`; double-click a segment to split (insert a
    sub-keyframe at the playhead).
- **Inspector** (right) — the selected keyframe's transform (position/scale/rotation/opacity/
  zBand/zIndex) and timing (delay/duration/easing), reusing the composer's numeric transform
  fields; the reserved 3D fields render read-only until Tier 2.
- **Canvas direct manipulation** — selecting an entity in the preview overlays
  `FreeTransformLayer`-style handles; dragging writes back to the active keyframe's transform.
  This is the composer's existing machinery pointed at a stage entity.

### Editor phases

- **E1 — Scrub & inspect (read-only):** story loads into the timeline; playhead scrubs the
  preview via the seek bridge; clicking things reveals their config. Immediately useful for
  authoring in YAML with live feedback, and forces the seek bridge — the same API capture needs.
- **E2 — Keyframe & timing editing:** drag diamonds, edit transforms/timing in the inspector,
  round-trip to the story config (db-backed stories write through the section-config path;
  fs-backed stories export YAML).
- **E3 — Transitions & clocks:** boundary transition picker; per-section clock/runway/timelineMs
  controls.
- **E4 — Direct manipulation & entity CRUD:** on-canvas transform handles; add/remove entities
  with asset picking; the "compose a scrollytelling story like a video edit" experience.

---

## Surface costs (delta over the stage doc's table)

| Surface | Cost |
|---|---|
| **Live scroll** | rAF sampler + triggered clock: moderate. Scrubbed sections touch the snap CSS and per-section progress math — the riskiest live-web piece; ship behind per-section opt-in. |
| **Autoplay** | Cheap: dwell = `max(timelineMs, ttsMs)`, clock already mechanical. |
| **Video capture** | *Improves.* The seek API replaces snap-only stages; capture renders real choreography deterministically. Frame budget: sampler is pure math. |
| **PDF / print** | Unchanged — stills at `t = 1` (today's settled poses). |
| **Mobile / portrait** | Scrubbed = native scroll, fine; portrait degrade rules carry over; rAF writes are cheaper than layout-triggering CSS on low-end. |
| **Admin** | The editor is the headline cost — bounded by reusing TimelinePanel/composer/seek-bridge rather than a new surface. |

---

## Milestones

1. **M0 — Schema + resolver v2.** Types, zod, `resolveStage` compiling per-entity segment lists;
   `sample(unit, t)` pure with exhaustive tests (retarget mid-flight, sub-keyframes, delays,
   back-compat snapshots for existing stage stories). No renderer change yet.
2. **M1 — Triggered clock + rAF renderer.** `StageVizSlot` v2; delay/duration/stagger live;
   `TWEEN_MS` retired; reduced-motion/capture snap = `t=1`.
3. **M2 — Section transitions.** `TransitionSpec` shared with the video editor; foreground
   boundary dressing + `revealDelayMs`; background `crossfade`; stage lifetime-edge sync.
4. **M3 — Scrubbed clock.** Runway scroll model, per-section progress in `StoryShell`, snap
   interop; per-section opt-in.
5. **M4 — Capture & autoplay integration.** Seek bridge (`viz-story-seek`), render pipeline
   drives `(unit, t)`, readiness gating for entity assets.
6. **E1–E4 — Editor** (parallel from M4; E1 needs only the seek bridge).

M0–M2 are the June-doc spirit: generalize a shipped mechanic, YAML-authorable throughout, nothing
blocked on the editor. M3 is the one deliberate scroll-model change, isolated behind opt-in.
The editor starts the moment the seek bridge exists — and the seek bridge is capture work anyway.

## Decisions captured (from discussion, Aug 20)

- **Both clocks, per-section** — triggered is the snap-friendly default; scrubbed is an explicit
  per-section trade of snapping for runway. One authored timeline serves both.
- **The editor is in scope now** — designed as a convergence with the freeform video editor
  (shared timeline UI lineage, shared `TransitionSpec`, shared transform editing), phased E1–E4,
  starting read-only on the seek bridge.
- **Foreground stays tier-disciplined** — slots cut (dressed by transitions) and stagger-reveal;
  they do not get motion tracks. Subjects & objects are the animated cast; that separation *is*
  the model.
- **Sub-keyframes over per-beat single poses** — `t` on the beat selector is the smallest schema
  change that unlocks multi-step choreography, and it degrades exactly to Tier-1 semantics when
  omitted.

## Open questions

- **Interrupted triggered timelines on fast reverse-scroll** — retargeting from the sampled pose
  handles forward skips; is reverse "play the beat backward" (scrub-like) or "retarget to the
  previous settled pose"? Proposal: retarget (cheap, predictable); revisit if it reads badly.
- **`timelineMs` vs TTS length in autoplay** — dwell is `max` of the two; does a much-longer TTS
  hold `t=1` (proposed) or stretch the choreography to fit?
- **Editor persistence for fs-backed stories** — YAML export from E2 or admin-only (db-backed)
  editing until the online-content migration lands?

---

*Refined August 20, 2026 from a design conversation, on top of the shipped Tier-1 stage
(PR #321). Tier-2 3D remains orthogonal: the sampler's domain gains fields (position3d,
quaternion, camera), not new machinery — the reserved fields already ride through the resolver.*
