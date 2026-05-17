---
title: "Vertical plugin demo — Footshort"
subtitle: "Proves the registry's plugin path: a Footshort match-card module loaded only because frontmatter.vertical declares it."
byline: "vizmaya · phase-6"
date: "2026-05-17"
status: "draft"
listed: false
vertical: "footshort"
theme:
  colors:
    background: "#0f1115"
    text: "#f1ecdf"
    accent: "#d8804a"
    accent2: "#7faecf"
    teal: "#7faecf"
    surface: "#1d2026"
    muted: "#8a8e96"
    positive: "#8ba17a"
    amber: "#d9a84a"
    red: "#c25b48"
    line: "#2c303a"
  fonts:
    serif: "Merriweather"
    sans: "Inter"
    mono: "JetBrains Mono"
---

# Footshort vertical demo

*Proves the vertical-bundle plugin path. The `fs:match-card` viz type isn't in the core registry — it's only available because this story's frontmatter declares `vertical: 'footshort'`.*

**By vizmaya · phase 6**

---

## Match card

A `fs:match-card` viz mounted via the new Footshort vertical bundle. The core dispatcher routes by string discriminator; the module itself lives in `components/story/viz/verticals/footshort/modules/match-card/`. No core file was touched to add this type.
