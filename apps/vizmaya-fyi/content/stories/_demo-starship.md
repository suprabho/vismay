---
title: 'Vertical plugin demo — Starship'
subtitle: "Proves the vertical-bundle plugin path for 3D: a Three.js / R3F module loaded only when frontmatter.vertical declares 'starship'."
byline: 'vizmaya · phase-7'
date: '2026-05-28'
status: 'draft'
listed: false
vertical: 'starship'
theme:
  colors:
    background: '#0a0e14'
    text: '#e0ddd5'
    accent: '#d8804a'
    accent2: '#7faecf'
    teal: '#7faecf'
    surface: '#1d2026'
    muted: '#8a8e96'
    positive: '#8ba17a'
    amber: '#d9a84a'
    red: '#c25b48'
    line: '#2c303a'
  fonts:
    serif: 'Merriweather'
    sans: 'Inter'
    mono: 'JetBrains Mono'
---

# Starship vertical demo

_Proves the vertical-bundle plugin path. The `starship:viewer` viz type isn't in the core registry — it's only available because this story's frontmatter declares `vertical: 'starship'`._

**By vizmaya · phase 7**

---

## Rotate — showcase spin

`mode: rotate` is the default showcase shot. Continuous Y-axis rotation, studio HDRI, metal preset.

## Explode — assembly view

`mode: explode` separates the three named parts (`cone`, `tank`, `raptor`) along ship-local Y. `scrubSteps` maps `activeStep` onto a 0..1 progress so the parts drift apart as the user scrolls past.

## Bellyflop — re-entry attitude

`mode: bellyflop` pitches the root group from 0° to ~70° on a back-ease curve. Scrubs both ways.

## Inspect — orbit + part labels

`mode: inspect` enables `<OrbitControls>` and overlays drei `<Html>` labels at each part's centroid. The only mode that consumes pointer input.
