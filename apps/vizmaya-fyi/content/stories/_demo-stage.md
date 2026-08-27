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

Now a *subject* enters — on a slide timeline. Over this beat's 1.6-second choreography the rocket swings in from the right, overshoots low, then settles: three sub-keyframes (`t: 0 / 0.45 / 1`) on one beat, not one tween. Its lifetime starts here — before this beat it isn't on stage at all.

## Max-Q

Peak dynamic pressure. This beat has no keyframe of its own — the rocket's position and scale are interpolated smoothly between Ascent and Orbit by the resolver's densifier.

## Orbit

Z-focus — staggered. This text fades in first (this section's boundary is a `fade` transition, and this panel carries `revealDelayMs: 250`), a faint particle field crossfades up behind it, then the rocket waits 200 ms and steps **in front** of the panel over 900 ms (`zBand: front`), with a second spark field drifting in 450 ms behind it. Four elements, four clocks, one beat.

## Coast

Scrubbed. This section is 2.5 viewports of runway — this panel pins while your scroll position IS the timeline. Drag up and down: the rocket swings through its three coast keyframes forward and backward, a video-editor scrub driven by the page. In autoplay, capture and embeds this beat collapses back to a one-viewport triggered snap.

## Re-entry

The descent begins — and this section *slides up* into place while Orbit's particle background crossfades back out (each boundary owns its own transition). The rocket scales down and tips over as it heads toward its exit, which lands just after this beat.

## Touchdown

The subject is gone — its lifetime ended at Re-entry. Only the ambient particles remain, having drifted across the entire story from one corner to the other.
