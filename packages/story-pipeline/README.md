# @vismay/story-pipeline

Sources → research → ask → render. A node-safe engine that turns pasted links and
uploaded files into a renderable **vizmaya** story (Deck or mapStory).

```
ingestSources({ links, files })  →  SourceDoc[]
research(sources)                →  ResearchBrief + clarifying questions   ← human gate
generateStory({ sources, brief, answers })  →  GeneratedStory
validateStory(story)             →  issue[]   (one repair pass on failure)
serializeStory(story)            →  { markdown, configYaml, charts }       ← write to content/stories
```

## Why it reuses, not reinvents

- **Ingest** wraps the format-agnostic `extract` (PDF/HTML/md/txt/eml) + adds csv/json.
- **The story contract is viz-engine's own.** `generateStory` constrains the model with
  `sectionBodySchema` (the same zod layer schemas the renderer validates with, deep-imported
  from `@vismay/viz-engine/src/lib/genSchema`) and reshapes output via `normalizeSectionBody` —
  so a section can never carry invalid visual YAML. `validateStory` re-runs each layer through
  the modules' real `parseConfig`.
- **Serialize** folds each section in through `appendStorySection`
  (`@vismay/content-source/storySection`) so the markdown `## anchor` and the config `text`
  can never diverge; chart specs become ECharts option JSON deterministically.

## Scope (first cut)

Ingest: links + pdf + txt + md + csv + json. Output: Deck + mapStory to the filesystem.
Layer/layout/chart surface is a curated, reliably-valid subset; image layers are omitted in
favour of an `imagePrompts` sidecar. See `docs/roadmap-june-2026.md` (item ⑤).
