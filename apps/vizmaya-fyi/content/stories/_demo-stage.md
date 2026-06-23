---
title: "Stage Tier Demo — Liftoff to Touchdown"
subtitle: "A throwaway deck exercising the Tier-1 subjects & objects stage: a persistent rocket (subject) and drifting particles (object) flowing across beats."
byline: "vizmaya · stage tier 1"
date: "2026-06-23"
status: "draft"
listed: false
format: "deck"
theme:
  colors:
    background: "#0a0e1a"
    text: "#e6ebf5"
    accent: "#ff8c42"
    accent2: "#4ea8ff"
    positive: "#5fd28a"
    surface: "rgba(14,20,34,0.62)"
    muted: "#8c97ad"
    line: "rgba(120,140,180,0.20)"
  fonts:
    serif: "Merriweather"
    sans: "Inter"
    mono: "JetBrains Mono"
---

## Liftoff

The stage tier mounts once and persists across every beat. Scroll down — the ambient particles drift behind this text the whole way, an *object*: decor, never interactive.

## Ascent

Now a *subject* enters. The rocket fades in from the upper-right and climbs as you scroll. Its lifetime starts here — before this beat it isn't on stage at all.

## Max-Q

Peak dynamic pressure. This beat has no keyframe of its own — the rocket's position and scale are interpolated smoothly between Ascent and Orbit by the resolver's densifier.

## Orbit

Z-focus. The rocket steps **in front** of this text panel — its keyframe sets `zBand: front`, lifting it above the foreground. That front/back capability is what separates a subject from an object.

## Re-entry

The descent begins. The rocket scales down and tips over as it heads toward its exit, which lands just after this beat.

## Touchdown

The subject is gone — its lifetime ended at Re-entry. Only the ambient particles remain, having drifted across the entire story from one corner to the other.
