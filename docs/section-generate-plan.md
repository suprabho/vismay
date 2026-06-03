# Plan: generate a story section (markdown + YAML) from a brief

**Status: plan-only. No code yet.** Scope (confirmed): **one section at a time**
into an existing story — not a whole-story scaffold.

## Goal

From a short brief ("a slide showing FY2025 revenue with the big number and a
delta line"), generate **one complete section** — its markdown (`## heading` +
prose) *and* its `config.yaml` section entry (kind + layout/foreground/background
or map) — and insert it into the story, persisted + re-rendered.

Today the canvas can add *layers/regions/overrides* to an existing section but
**there is no add-section flow at all** — authors hand-edit the `.md` and
`.config.yaml`. This feature is both the generator *and* the first add-section
path.

## The story model (verified)

A story is a markdown file + a `config.yaml`, linked per section by a **text
anchor**:

- **markdown** — `## Heading` starts a section; blank-line-separated paragraphs
  are its prose.
- **config.yaml** — a `sections:` array; each entry has `id`, `text` (must match a
  `## Heading` *exactly*), optional `kind` (`text|hero|stat|cover|bigStat|…`), and
  either a legacy `map:` block **or** modern `foreground:`/`background:` layer
  stacks.

Minimal valid section:
```markdown
## Revenue clears $18.7B

Consolidated revenue rose 33% year over year.
```
```yaml
  - id: revenue-fy2025
    text: "Revenue clears $18.7B"
    kind: bigStat
    foreground:
      - { type: bigStat, value: "$18.7B", label: "FY2025 revenue", delta: "+33% YoY" }
```
The `text` field and the `## heading` are written from the **same string**, so the
anchor always matches by construction.

## Architecture

```
Brief (+ story format: deck|map, theme)
        │
        ▼
POST /api/vizmaya/stories/[slug]/canvas/generate-section
        │  system = SECTION schema prompt (composes the layer schemas we built
        │           for foreground/background + the section-entry shape)
        ▼
generateText({ schema: SECTION })  →  { heading, paragraphs[], kind, sectionEntry }
        │
        ▼
appendSection(markdown, configYaml, result)   ← NEW insertion primitive
        │  • markdown: append "## {heading}\n\n{paragraphs}"
        │  • configYaml: push { id, text: heading, kind, ...sectionEntry } to sections[]
        ▼
PUT /api/vizmaya/stories/[slug] { markdown, config_yaml }  (existing, validates)
        │
        ▼
canvas rebuilds (dataNonce bump) → new section paginated in
```

### The structured output (Zod schema in the route)

```ts
const Section = z.object({
  heading: z.string(),               // becomes both the ## heading and `text`
  paragraphs: z.array(z.string()),   // markdown body
  kind: z.enum([...SectionKind]),    // text|hero|stat|cover|bigStat|bodyText|…
  // The config-entry body (no id/text — the route sets those):
  foreground: z.unknown().optional(),// layer list, authored to the layer schemas
  background: z.unknown().optional(),
  map: z.unknown().optional(),       // for map-format stories
})
```

The system prompt **composes the schema work already done**: it embeds the
foreground/background layer-type menu + the per-layer field shapes (from
`buildLayerSchemaPrompt` / `overrideSchemas`) so the generated `foreground`
parses. Story **format drives the default**: deck stories → `foreground`/layout;
map stories → a `map:` camera block (read `frontmatter.format`).

### The insertion primitive (new)

`yamlSections.ts` today has `duplicate/delete/move/replaceSection` but **no
append**. Add:
- `appendSection(configYaml, entry) → newConfigYaml` (push to `sections[]`,
  preserving comments/formatting via the YAML AST it already uses).
- a markdown append helper (`## heading` + paragraphs at end of body).
- generate a unique `id` from the heading (slugify + dedupe against existing ids).

Persist through the existing `PUT /api/vizmaya/stories/[slug]` which already
validates markdown + config and runs `loadStoryConfig` post-write.

## UI surface

The deck/section pagination header (e.g. "spacex-ipo-2026 · 14 sections") gains a
**"+ ✨ Section"** affordance. It opens a small brief input (a PromptBar variant);
on apply: generate → `appendSection` → save → the new section paginates in (jump
to it). Position: append at end for v1 (insert-after-current is a later nicety).

## Build order

1. **Insertion primitives** — `appendSection` + markdown append + id generation,
   unit-tested against a sample story (no AI yet). De-risks the file surgery.
2. **generate-section route** — Zod `Section` schema + the composed system prompt;
   validate the generated `foreground`/`map` parses before returning.
3. **UI** — the "+ ✨ Section" entry point and the generate→insert→save→rebuild
   wire-up.

## Open decisions

- **A. Position** — append at end (v1) vs insert after the current section. Append
  is simpler and avoids re-indexing overrides.
- **B. Kind/format inference** — let the model pick `kind` and foreground-vs-map
  from the brief + story format, vs the author pre-selects. Recommend model picks,
  author can edit after (the new section is fully editable via the canvas).
- **C. Theme/assets** — generated `foreground` should reference existing theme
  tokens (accent/accent2…) and not invent asset URLs; image layers should be left
  as a prompt for the ✨ image flow rather than fabricated `src`s.
- **D. Reuse vs new route** — a dedicated `generate-section` route (recommended)
  vs overloading the slot `generate` route with a `kind: 'section'`. A section is
  multi-part output (markdown + config), unlike the single-string slots, so a
  separate route is cleaner.
