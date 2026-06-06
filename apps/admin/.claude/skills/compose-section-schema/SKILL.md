---
name: compose-section-schema
description: >-
  Use when generating, editing, or validating a Vizmaya story section's visual
  config — the section `body` (or a `config.yaml` foreground/background/map entry)
  in compose mode and the canvas. Covers the generatable foreground layer types
  and their fields, the deck layouts and which layers each region accepts, the
  map camera shape, the theme color tokens, and the anchor + validation rules
  that make a section valid by construction. Reach for this whenever you see
  `sectionBodySchema`, `genForeground`, `foreground:`/`background:`/`map:`,
  `bigStat`/`keyValue`/`quote` layers, or "generate/regenerate a section".
---

# Vizmaya section schema (compose mode)

A Vizmaya story is a **markdown file + a `config.yaml`**, linked per section by a
**text anchor**. This skill is the authoritative, on-demand reference for a
section's *visual* config so a generated section is valid by construction —
keep it out of base system prompts and load it only when authoring a section.

Source of truth in code (this skill mirrors it; if they ever disagree, the code
wins): `packages/viz-engine/src/lib/genSchema.ts` (the generation contract),
`packages/viz-engine/src/foregroundLayouts.ts` (layouts), and the per-layer
modules under `packages/viz-engine/src/modules/`. The pipeline that emits
sections is `packages/story-pipeline/src/{generate,schema,validate}.ts`.

## The section model

- **markdown** — `## Heading` starts a section; blank-line-separated paragraphs
  are its prose.
- **config.yaml** — a `sections:` array; each entry has `id`, `text` (must match
  a `## Heading` *exactly* — the anchor), an optional `kind`, and the visual
  `body` (`foreground` / `background`, or `map` for map stories).

The `text` field and the `## heading` are written from the **same string**, so
the anchor always matches by construction. Never paraphrase one without the other.

`kind` is one of: `text · hero · stat · cover · bigStat · bodyText · split ·
data · gallery · quote · divider · closing`.

## The `body` shape

`body` is **structured fields, never a YAML string**. Three parts:

```
body:
  foreground: <flat layer list>  OR  { layout, regions }   # deck
  background: <a single layer, or { type: none }>          # optional
  map: { center:[lng,lat], zoom, pitch?, bearing?, pins? } # map stories only
```

- **Deck** → set `foreground`: either a **flat `layers` list**, or a **`layout`
  name + `regions`** (each region maps to its layers). Leave `foreground` out
  entirely for a text-only section (the prose carries it).
- **Map** → set `body.map` to the section camera. A `foreground` is optional.

## Generatable foreground layer types

Only these are emitted by generation (the discriminated union on `type`). Authors
can hand-add richer layers (`table`, `rive`, `video`, `embed`, `map`) later.

| `type` | What it is | Key fields |
|---|---|---|
| `bigStat` | a giant number with label + delta | `value` (req, e.g. `"$18.7B"`), `unit?`, `label?`, `delta?` (e.g. `"+33% YoY"`), `deltaColor?`, `color?`, `align?` |
| `chart` | references a chart defined for the story | `id` (req — **must match** a top-level chart id; the layer never defines data/type) |
| `bodyText` | prose paragraphs | `source: "text"`, `content` (string or string[]), `heading?`, `showHeading?`, `style?` `{ size: small\|normal\|large, color: text\|muted\|accent\|accent2 }` |
| `text` | text or stat panel (falls back to section content) | `kind: "text"\|"stat"`, `heading?`, `subheading?`, `content?` (string or string[]), `color?` |
| `quote` | a pull quote | `text` (req, inline markdown ok), `attribution?`, `align?` |
| `keyValue` | a two-column definition list | `items` (1–12 of `{ key, value, color? }`), `title?` |

> **Do NOT generate `image` or `imageGrid` layers.** They need a real `src`, and
> fabricating asset URLs is the single most common way a section breaks. Request
> imagery via the outline's `imagePrompts` sidecar instead, and carry the section
> with stats / charts / quotes / prose.

## Deck layouts and their regions

When you use `layout` + `regions`, the region **names** and what each **accepts**
are fixed by the layout. Putting a layer in a region that doesn't accept it is a
validation error.

| `layout` | regions → accepts |
|---|---|
| `text-left-chart-right` | `text` → text/bodyText/quote · `chart` → chart/map/image |
| `text-left-quote-right` | `text` → text/bodyText · `quote` → quote |
| `image-left-text-right` | `image` → image/imageGrid · `text` → text/bodyText |
| `stat-left-chart-right` | `stat` → bigStat/keyValue · `chart` → chart/map |
| `stat-top-chart-below` | `stat` → bigStat/keyValue · `chart` → chart/map |
| `chart-top-text-below` | `chart` → chart/map/image · `text` → text/bodyText |
| `centered` | `default` (single centered region) |
| `hero-full-bleed` | full-bleed hero region |
| `free` | `default` (flat, self-flowing) |

Every layout also has a back-compat `default` region; prefer the named regions.
A flat `layers` list (no `layout`) always works for simple stacked sections.

## Map camera (`body.map`)

`center: [lng, lat]` (note **lng first**), `zoom`, optional `pitch`, `bearing`,
and `pins: [{ coordinates: [lng, lat], … }]`. Coordinates are `[number, number]`,
never an object.

## Theme color tokens

Color fields take a **theme token**, never a raw hex (the engine supplies the
palette): `accent · accent2 · red · positive · amber · teal · muted`. Defaults:
`bigStat.color` → `accent2`, delta/most secondary text → `muted`.

## Hard rules (these are what the validator checks)

1. **Anchor exact-match** — `## heading` and config `text` are the same string.
2. **No invented chart ids** — a `chart` layer's `id` must exist in the story's
   top-level `charts` list.
3. **No fabricated asset `src`** — don't emit `image`/`imageGrid` in generation.
4. **Layers go in regions that accept them** (table above).
5. **Theme tokens for colors**, not hex.
6. **Ground every figure in the sources** — do not invent data.
7. **Unique, non-empty headings** within a story.

## Minimal valid section

```markdown
## Revenue clears $18.7B

Consolidated revenue rose 33% year over year.
```
```yaml
  - id: revenue-fy2025
    text: "Revenue clears $18.7B"
    kind: bigStat
    body:
      foreground:
        layout: stat-left-chart-right
        regions:
          - name: stat
            layers:
              - { type: bigStat, value: "$18.7B", label: "FY2025 revenue", delta: "+33% YoY", deltaColor: positive }
          - name: chart
            layers:
              - { type: chart, id: revenue-growth }
```
(`revenue-growth` must be a chart defined in the outline's `charts` list.)

## Self-validation contract

Before persisting, a section is valid iff `validateStory`
(`packages/story-pipeline/src/validate.ts`) returns no issues. It:

- re-parses **every** foreground/background layer through its module's real
  `parseConfig` (the same check the renderer runs),
- checks the `layout` name is registered and each region name exists in it,
- cross-references every `chart` layer `id` against the emitted chart specs,
- flags empty/duplicate headings.

When generating agentically (Phase 2), expose this as a `validate_section` tool
and revise until the issue list is empty — that is the rubric.
