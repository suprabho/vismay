---
title: "Vertical plugin demo — Footshorts"
subtitle: "Proves the registry's plugin path: a Footshorts match-card module loaded only because frontmatter.vertical declares it."
byline: "vizmaya · phase-6"
date: "2026-05-17"
status: "draft"
listed: false
vertical: "footshorts"
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
    serif: "Forum"
    sans: "Manrope"
    mono: "Space Mono"
---

# Footshorts vertical demo

*Proves the vertical-bundle plugin path. The `fs:match-card` viz type isn't in the core registry — it's only available because this story's frontmatter declares `vertical: 'footshorts'`.*

**By vizmaya · phase 6**

---

## Match card — score

The default `fs:match-card` layout: editorial panel with crests, score, and competition kicker. Use it where the score (or pre-match `vs`) is the headline.

## Match card — compact

A small chip with kickoff time, the two teams, and a competition footnote. Drops naturally into a sidebar or as a dense list item.

## Match card — horizontal

Hero treatment that spans wide, with a split home/away gradient and the competition tag watermarked behind. Good for headers and social cards.

## Match card — portrait

Tall sheet with crests side-by-side, big kickoff stack, and an optional "Watch on …" line. Use it for matchday spotlights.

## Match row

`fs:match-row` reuses the `MatchRow` component extracted in E4. It accepts the full `FixtureRow` shape as inline YAML, the same data contract Footshorts's own league pages render against.

## Standings table

`fs:standings-table` wraps the `StandingsTable` component. YAML carries the rows array inline. Future iterations will support `data:` references that pull from the live standings table.
