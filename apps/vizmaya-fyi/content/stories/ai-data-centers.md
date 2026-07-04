---
title: "The Gigawatt Race"
subtitle: "A handful of US campuses now hold most of the world's frontier AI compute. Epoch AI tracks their power, chips, and cost from satellite imagery and permits — here is where the build-out stands."
byline: "vizmaya · July 2026"
date: "2026-07-04"
status: "draft"
listed: false
theme:
  colors:
    background: "#0a0c0f"
    text: "#dbe7f0"
    accent: "#22d3ee"
    accent2: "#a78bfa"
    teal: "#5eead4"
    surface: "#0b0e12"
    muted: "#8b98a5"
    positive: "#34d399"
    amber: "#f59e0b"
    red: "#f43f5e"
    line: "#232b33"
  fonts:
    serif: "Fraunces"
    sans: "Inter"
    mono: "JetBrains Mono"
---

# The Gigawatt Race

*A handful of US campuses now hold most of the world's frontier AI compute. Epoch AI reconstructs their power, chips, and capital cost from satellite imagery and public permits — because the companies building them rarely say. This is where the build-out stands.*

**By vizmaya · July 2026**

> The figures in this story are a representative snapshot pending reconciliation against the live Epoch dataset. The interactive [AI Data Centers explorer](/ai-data-centers) reads the current numbers directly.

---

## The gigawatt race

The frontier is now measured in **gigawatts**. The largest single campus, OpenAI and Oracle's Stargate site in Abilene, Texas, has climbed from a bare slab to roughly **900 MW** of planned power in under two years — the electricity draw of a mid-sized city, pointed at a single training run.

Epoch estimates each facility's power not from press releases but from the **cooling infrastructure visible in satellite imagery** — chillers and cooling towers scale with heat, and heat scales with compute.

## Where the compute sits

Power is the constraint; compute is the point. Measured in **H100-equivalents** — a single performance unit that normalizes across GPU generations — the same few campuses dominate. Stargate Abilene and xAI's Colossus in Memphis lead, with Meta's Hyperion and Amazon's Project Rainier close behind.

## The bill

The capital is extraordinary and concentrated. The top campuses each represent **$10–25 billion** of committed 2025-dollar investment, and the total across the frontier is climbing faster than any prior compute build-out on record.

## Data accessibility for builders

Epoch AI publishes the whole dataset as CSVs under **CC BY 4.0** — free to use with attribution. The [facility table](https://epoch.ai/data/generated/data_centers/data_centers.csv) and [build-out timelines](https://epoch.ai/data/generated/data_centers/data_center_timelines.csv) refresh roughly weekly. Vizmaya ingests them into Supabase on a schedule; the [live explorer](/ai-data-centers) is always current, while this story is frozen at its cutoff.

*Data: [Epoch AI — Frontier Data Centers](https://epoch.ai/data/ai-data-centers) (CC BY 4.0).*
