# @vismay/club-marks

`toClubMark()` turns a club's real crest and home kit into the football-seasons
club mark (the *Club Mark Generator — Function Spec*, Oct 19 2026): a
crest-family shape with an ink keyline, filled with the home-kit pattern in two
kit colours, plus a three-letter code. The crest is read once, to pick the
family, and nothing of it reaches the output.

```ts
import { toClubMark } from '@vismay/club-marks'

const r = await toClubMark({
  clubId: 'barcelona', name: 'FC Barcelona', league: 'ESP', era: { from: 2003, to: 2003 },
  crest: { url },                                      // classification only
  kit: { pattern: 'stripes', c1: '#A50044', c2: '#004D98' },
}, { opponents, takenCodes })
// r.row     { code, crest, pattern, c1, c2, league, from, to } — store this
// r.renders { dot, token, hero } SVG, r.checks (six), r.print (CMYK), r.needsReview + r.reviewReasons
```

Any surface re-renders from the row alone: `renderClubMark(row, tier, { surface })`
(`./render`, client-safe). The same row always gives byte-identical SVG.

## Pipeline

1. **Classify** (`classify.ts`, sharp): the crest → a 256 px alpha mask →
   aspect, fill, the fit of an ellipse (also measured below any crown or
   stars), the width of the upper body and the lower third's taper → roundel /
   oval / heater / plate with a 0–1 confidence. Calibrated on the 2003–04
   crests: circles fit an ellipse at 0.99+, shields at ~0.85 with a flat top.
2. **Gate:** under 0.75, or no crest, → review. `overrides.family` skips 1–2;
   national teams are always roundels.
3. **Row:** code from `overrides.code`, else `standardCode()` (broadcast codes
   for well-known clubs, else the first distinctive word); pattern, c1, c2
   from the kit only (`E_NO_KIT` without one).
4. **Snap:** c1 and c2 snap to the nearest swatch of `palette.cmyk.json` (the
   project's `color-palette.json`, CMYK) by CIEDE2000, and the row carries the
   swatches, so screen and print agree (near-ties of a chromatic colour go to
   the closer hue: a kit red lands on red, not orange). The kit colours and
   each snap's ΔE stay in the result; a snap over ΔE 15 (the palette has
   nothing close, e.g. Wikipedia's pure #0000FF) goes to review.
5. **Checks** (`checks.ts`): grayscale bands (Δ L\* ≥ 20), silhouette vs page
   (keyline ≥ 3:1), pattern legibility (bands ≥ 0.75 pt), code legibility
   (≥ 4.5:1), print colour (snap ΔE ≤ 15), fixture collision (family, pattern or
   ≥ 20 L\* in c1).
6. **Auto-fix:** c2 moves along its own hue until the grayscale check passes
   (for a swatch: the nearest step of its own ramp that clears 20 L\*);
   the paper keyline (`#EDECE7`) and paper code replace ink on dark or
   club-colour surfaces. Everything else goes to review.
7. **Render:** `dot` (no code; stripes and hoops at half the bands, quarters as
   halves), `token` and `hero` (code under the shape in Archivo Narrow Bold).
   The keyline is 4% of the box, ≥ 0.5 pt at the tier's smallest size.

## Notes and open points

- **Snap vs the spec:** the spec maps colours to the palette only for print
  and reviews ΔE > 5; here (by decision, Oct 19) the row itself is snapped and
  only a snap over ΔE 15 is reviewed, because Wikipedia's kit colours are crude
  primaries that sit 5–20 ΔE from any swatch.
- **BAR vs the grayscale rule:** the spec's Barcelona colours snap to pink-800
  and blue-700, which are close in L\*, so the grayscale check moves c2 along
  the blue ramp. "BAR matches the spread" and the 20 L\* rule cannot both hold
  exactly; one of them needs to give.
- **Flag tab:** the hero tier's league flag tab is left to the surface (it
  depends on the context); the row carries `league`.
- **Codes:** there is no code source in the data, so codes outside the
  standard list are generated and duplicates go to review.

## Tests

`pnpm --filter @vismay/club-marks test`: CIEDE2000 reference data, the print
palette, codes, renders (geometry, colours, reduced patterns, keyline swap,
byte-identical), the six checks, family classification on synthetic
silhouettes (and that no crest colour reaches a render), the review gates,
overrides and `E_NO_KIT`.
