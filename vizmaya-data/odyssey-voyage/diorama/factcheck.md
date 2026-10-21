# Fact-check: the Odyssey as a diorama

Checked 21 October 2026 for `packages/html-stories/formats/examples/odyssey-diorama.html`
(data: [`story.json`](story.json), the same JSON the page embeds). Distances are
great-circle (haversine, Earth radius 6,371.0088 km) between the coordinates in
`story.json`; the lint recomputes every `computed` quantity on each post
(`packages/html-stories/src/diorama.ts`).

## Checks

| Claim | Research | Computed from coordinates | Action |
| --- | --- | --- | --- |
| Troy → Ithaca, straight line | ~565 nm (`distances.csv`, after Harry Mount) | **273.3 nm** (506.1 km), `haversine(troy, ithaki)` | Replaced; the page says 273 nm. Flagged below. |
| Troy → Cape Malea → Ithaca by sea | not given | **424.1 nm** (256.0 + 168.1), `route(troy, malea, ithaki)` | Used on the cover as "≈424 nm". |
| Direct trip under sail | "6 days to two weeks" at ~5 kn, ≤100 nm/day (`distances.csv`) | At 424 nm: ≥4.2 days at 100 nm/day; two weeks ≈ 30 nm/day | The lower bound came from the 565 nm figure. Kept "two weeks" as the upper end (`sail-weeks`, status `estimate`); the dek says "a week or two". Open question 1. |
| Nine days' drift, traditional reading | 630–900 mi, lands in Tunisia | Malea → Djerba **717.4 mi** | Consistent. |
| Nine days' drift, Severin | ≈270 mi, lands in Libya | Malea → Cyrenaican coast **258.8 mi** (to 32.85°N 21.85°E, a notional point) | Roughly consistent (−4%). The design brief's own check gave 330 mi to a point further west; the figure depends on the point. Open question 3. |
| Circe and Calypso's share of the decade | about 8 of 10 years | 1 + 7 = **8**, `sum(calypso-years, circe-years)` | Consistent. |
| Uses of *oînops* | 17 (5 *Iliad*, 12 *Odyssey*) | 5 + 12 = **17** | Consistent. |
| Ithaki → Paliki | not given | **35.0 km**, `haversine(ithaki, paliki)` | New figure, used in the close-up. |
| Stops on the traditional route | 14 landfalls plus Troy | **15** stops, `stops(trad)` | Consistent. |
| Fleet and crew | 12 ships, ~720 men | 12 × ~60 = 720 | Reconstructed: printed with "≈" and footnoted. The running count follows `voyage_stops.csv`. |
| Design brief's own figures | 274 nm (507 km); ≈421 nm (255 + 166) | 273.3 nm (506.1 km); 424.1 nm (256.0 + 168.1) | Within 1%: rounding and slightly different coordinates. The page uses the computed values. |

## Places and certainty

- **Excavated:** Troy (Hisarlik), Ismaros (Maroneia), Ithaca (modern Ithaki).
  **Hinge:** Cape Malea. Everything after Malea is `tradition` or `contested`.
- The **Necromanteion** is excavated, but its ruins date no earlier than the
  late 4th century BCE, so its Homeric link is `contested`.
- `voyage_stops.csv` gives the Laestrygonians **Severin's** coordinates
  (Mezapos) and the Underworld the **Necromanteion's**. The traditional route
  uses Leontini (Thucydides) and Cumae / Avernus (Bérard) instead; Mezapos and
  the Necromanteion sit on Severin's route.
- Bradford's route names only the stops `route_theories.csv` gives him
  (Favignana, Ustica, Bonifacio, Li Galli, Malta). The rest are filled from the
  traditional reading and listed in `gapFilled`, so they draw hollow.
- Notional points (not claimed as places): the Cyrenaican coast (Severin names
  the region, not a beach), "Out in the Ocean" (Atlantic theories name no
  place), and the Thinia line in the close-up.

## Quotes

Two epigraphs, both from the cleared list in `INGEST_NOTES.md`, both under 25 words:

- Stanford (1947), on *Od.* 9.80–81: "After this he leaves the sphere of
  Geography and enters Wonderland." (The second sentence of the cleared quote.)
- Eratosthenes, via Strabo, *Geography* 1.2.15: "You will find the scene of the
  wanderings of Odysseus when you find the cobbler who sewed up the bag of the
  winds."

Diggle's line is paraphrased in the dated caveat box rather than quoted, to stay
at two quotes.

## Removed from the design canvas

- "≈400,000–290,000 years ago, the last sea channel" (canvas board S7) is not in
  the research files, so it isn't on the page.
- The canvas's Laestrygonians crew count, "≈54", isn't the research's; the page
  follows `voyage_stops.csv` (48).

## Sources

All ten links in `story.json` were opened on 21 October 2026. Two from
`story.yaml` returned 404 and were replaced with live Internet Archive records:

- Stanford: `odysseyofhomer0001home` → `odysseyofhomer0000wbst` (the 1959
  second edition).
- Gladstone: `studiesonhomerh01gladgoog` → `studiesonhomera00gladgoog`
  (volume III, which holds the chapter on colour).

## Open questions for the editor

1. **The headline's "two-week".** It rests on the research's "6 days to two
   weeks", which was worked out from its 565 nm figure. At the computed 424 nm, a
   galley at its best (100 nm a day) needs about four days, so two weeks assumes
   a cautious 30 nm a day. Keep the headline, or change it to "A week's sail that
   took ten years"?
2. **Severin's galley.** The spec conflicts (54 ft and ~20 oars, against 14 m and
   22 rowers). It is not printed anywhere; confirm it against *The Ulysses
   Voyage* before it is.
3. **Severin's landfall.** The ≈270 mi drift check depends on where on the
   Cyrenaican coast it ends. Is there a named beach in the book?
4. **Bradford's identifications** are sourced to Wikipedia's "Geography of the
   Odyssey". The page has no link to *Ulysses Found* itself; add one if there is
   a catalogue record.
5. **Share image.** `og:image` is still the placeholder shared with the other
   Odyssey examples.
