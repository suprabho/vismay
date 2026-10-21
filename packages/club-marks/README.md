# @vismay/club-marks

`toClubMark()` turns a club's data row into a flat, print-ready mark for the
football-seasons books (spec 2.2, Oct 21 2026): a shape family, a rim of 0–3
bands, a field in the kit colours, and charges on it — plain shapes or emblems
from the house library (simplified crest motifs drawn in Figma: Vismay Brands ›
FS-stlb › Club marks). The badge itself is never traced: it is read once to
guess the family; emblems are placed by hand.

```ts
import { toClubMark } from '@vismay/club-marks'

const r = await toClubMark({
  clubId: 'arsenal', name: 'Arsenal', league: 'ENG', era: { from: 2002, to: null },
  crest: { url },                                        // family guess only
  kit: { pattern: 'sleeves', c1: '#CF2D36', c2: '#17325C' },
  rim: [{ colour: '#F2B300', width: 9 }],                // omit = default ring + white gap; [] = none
  charges: [{ shape: 'cannon', colour: '#F2B300', x: 6, y: 7 }],
}, { takenCodes })
// r.row     { code, crest, pattern, c1, c2, ring, rim?, charges, league, from, to }: store this
// r.renders { chip, token, hero } SVG · r.checks · r.print (CMYK) · r.needsReview + r.reviewReasons
```

Any surface re-renders from the row alone: `renderClubMark(row, tier, { size, title })`
(`./render`, client-safe). The same row always gives byte-identical SVG. When the
same mark can appear more than once in a page, pass `uid` (or re-key with
`withClipUid(svg, uid)`, e.g. React `useId`): browsers resolve `url(#id)` to the
first element with that id, and a hidden first copy unclips every other copy. No text
is drawn; the code is for captions and alt text.

## The mark

All layers are clipped to the family shape, on a 100-unit box:

| Layer | What it is |
| --- | --- |
| Shape | roundel, heater (the curved shield redrawn in Figma), oval, plate (rounded square), hexagon. The classifier guesses the first four; hexagon is set by hand. |
| Field | The kit pattern in c1/c2: solid, stripes (9 symmetric bands), hoops, halves, sleeves (sides to a third of the box), band; laid out inside the rim. Then the **field-layer** charges (drawn at every size, the chip included). |
| Emblems | The **emblem-layer** charges (token and hero only). |
| Rim | 0–3 bands from the edge inward (`RimBand { colour, width }`), drawn as inner strokes so they keep one width round every family and trim anything moved to the edge. Default: the ring colour (9) + a white gap (3); the ring colour is c2 if it is dark enough on paper, else a darkened c1, else ink. |
| Over | **over-layer** charges, above the rim (token and hero). |

**Charges** (`charges.ts`, `emblems.ts`): primitives (circle, triangle,
triangle-down, square, diamond, bar, chevron, star, cross, ring, half circle,
hexagon) or library emblems (cannon, lion-rampant, lion-head, globe, rose,
ring-ribbon, sword, tower, chevrons, star-5, fox-head, imp-head, liver-bird,
eagle, escutcheon, band, hoop, pennant, seahorses, star-crescent, pickets,
tree, football, flower, cockerel, wolf-head). An emblem keeps its drawing's
geometry (a 120-unit box, mapped to 100) and has 1–3 colour slots. Each charge
takes `scale` (0.1–4), `sx`/`sy` stretch (0.1–6), `rotate` (±180°), `x`/`y`
offsets from the family anchor (±60) and a `layer`. Up to 10 per mark.

Stored as text: charges `;`-separated
`shape:#A[/#B…][@scale,rotate,x,y[,sx,sy]][~field|~over]`, e.g.
`band:#009A8E@1,0,0,-28,1,0.5~over`; the rim `#HEX@width;…`, `none`, or `''`
for the default.

To add an emblem, draw it in a 120-unit Figma component and add an entry to
`EMBLEMS` in `emblems.ts`: `{ label, slots, cx, cy, svg }`, where `svg` is the
drawing's fragment with `{a}`/`{b}`/`{c}` colour slots and `cx`/`cy` its centre
in the 120 box.

**Sizes:** `chip` 24 px (field, field-layer charges and rim; every band at
least 1 px), `token` ~120 px, `hero` (360 px by default).

## Pipeline

1. **Classify** (`classify.ts`, sharp): the crest → a 256 px alpha mask →
   roundel / oval / heater / plate with a 0–1 confidence.
2. **Gate:** under 0.75, or no crest, → review. `overrides.family` skips 1–2;
   national teams are always roundels.
3. **Row:** code from `overrides.code`, else `standardCode()`; pattern, c1, c2
   from the kit (`E_NO_KIT` without one); `E_BAD_CHARGE` / `E_BAD_RIM` for
   malformed charges or rims.
4. **Print:** every colour (kit, rim, charges and their slots) snaps to the
   nearest swatch of `palette.cmyk.json` by CIEDE2000; a kit snap over ΔE 15
   goes to review. CMYK for c1, c2, the ring, each rim band and each charge.
5. **Checks** (`checks.ts`): greyscale (kit bands ≥ 20 L\* apart; c2 moves
   along its ramp to fix), edge on paper (the default ring ≥ 4.5:1; a drawn
   rim or rimless field ≥ 3:1, else review), charges (review only when no
   emblem-layer charge reads 3:1 on c1), chart size (each chip rim band and
   the narrowest kit band ≥ 1 px), print (snap ΔE ≤ 15).

## Data

- Kits: `vizmaya-data/football-seasons/scripts/kits.py` (Wikipedia kit
  templates → `data/kits.csv`), hand fixes in `data/kits_overrides.csv`.
- The editorial design: `data/mark_overrides.csv` (`family`, `rim`,
  `pattern`, `c1`, `c2`, `charge`), pushed to `seed_*` columns; it wins over
  the kit, and the admin review overrides win over it. The 2003–04 Premier
  League rows are the Figma redraws.
- Storage: `admin_club_marks` (footshorts migrations 20261021000000 →
  20261025000000), generated and reviewed in the admin Books → Crests → Club
  marks view; `history:club-marks-sync --pull` writes `data/club_marks.csv`.

## Tests

`pnpm --filter @vismay/club-marks test`: CIEDE2000 reference data, the print
palette, codes, charge and rim text round-trips, emblem mapping, layers
(field at chip size, over above the rim), rim bands, renders (byte-identical,
no text), the ring rule, the checks, family classification on synthetic
silhouettes, the review gates and the error codes.
