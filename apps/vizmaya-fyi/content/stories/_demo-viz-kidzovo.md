---
title: "Vertical plugin demo — Kidzovo"
subtitle: "Proves the registry's plugin path: a Kidzovo vertical loader fires only because frontmatter.vertical declares it. No kz:* modules yet — that's phase 1+."
byline: "vizmaya · kidzovo phase-0"
date: "2026-05-28"
status: "draft"
listed: false
vertical: "kidzovo"
theme:
  colors:
    background: "#fff7ec"
    text: "#3d2a17"
    accent: "#ff7aa9"
    accent2: "#65d0d0"
    surface: "#ffffff"
    muted: "#9a7d65"
    line: "#f2c8b6"
  fonts:
    serif: "Fraunces"
    sans: "Nunito"
    mono: "JetBrains Mono"
---

# Kidzovo vertical scaffold

*Proves the Kidzovo vertical plugin path. When this page loads, `@vismay/kidzovo-viz`'s `register()` runs and the dev console logs `[kidzovo-viz] registered`. No `kz:character` or `kz:bubble` modules exist yet — those land in phases 2 and 3 per `docs/kidzovo-vertical-plan.md`.*

**By vizmaya · kidzovo phase 0**

---

## What's wired

The scaffold registers the `kidzovo` vertical loader in `apps/vizmaya-fyi/components/VerticalLoader.tsx` alongside `footshorts` and `f1`. When a story (this one) declares `vertical: kidzovo` in its frontmatter, the engine resolves the loader and dynamic-imports `@vismay/kidzovo-viz`. `register()` is currently a no-op apart from the console log — phase 1 will add the `kz-storybook` foreground layout, phase 2 the character module, phase 3 the bubble module.

## What's not wired yet

No foreground modules. The full Ovi's Messy Room story (`content/stories/ovi-messy-room.md`) arrives in phase 4 once `kz:character` and `kz:bubble` are shipped end-to-end.
