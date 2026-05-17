---
title: "Viz registry demo — image and embed"
subtitle: "A scratch story for verifying the image and embed viz modules across both slots."
byline: "vizmaya · phase-3"
date: "2026-05-17"
status: "draft"
listed: false
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

# Viz registry demo — image and embed

*A scratch story for the new viz module registry. Each section exercises one slot combination.*

**By vizmaya · phase 3**

---

## Viz demo

A demo story exercising the new viz module registry. Scroll to see image and embed modules render across both slots.

The hero section keeps the legacy map background — back-compat is preserved.

---

## Image as the backdrop

Section two replaces the map with an image in the background slot. The foreground stays empty so the photo takes the full viewport.

Image source is an external URL, but the same YAML works with `assets://<slug>/<filename>` once an asset is uploaded.

---

## Image overlay on map

Section three composes a map with three image overlays at different positions, sizes, opacities, and z-indexes. Each overlay sets its own `style:` block — `position`, `size`, `opacity`, `blendMode`, `pointerEvents`, `zIndex`. The map keeps its single WebGL context underneath.

Overlays sit in the left column so they stay visible alongside this text card on the right.

---

## Embed in the foreground

Section four puts an iframe in the foreground slot. Live mode shows the actual embed; capture or print mode swaps to the required `poster` image so the headless render pipelines don't rasterize a half-loaded iframe.

The map keeps rolling underneath as the page-wide background.

---

## Video in the foreground

Section five plays a looping muted MP4 in the foreground slot. The video module honors `loop` / `muted` / `autoplay` defaults, and `freeze()` seeks to `posterTime` then awaits `requestVideoFrameCallback` so PDF and share captures don't rasterize a black frame.

The map continues underneath. Open with `?capture=1` to confirm the still-frame path.

---

## Rive in the foreground

Section six embeds the existing `vizmaya-logo.riv` via the new Rive module. Each color node in the file's view model (`textColor`, `accentColor`, `tealColor`, …) is bound from YAML — no code change required to recolor or swap the `.riv`.

The module also supports state-machine inputs driven by `activeStep` and four `capture.mode` strategies. Open with `?capture=1` to confirm the still-frame freeze.
