# The Odyssey voyage — ingest notes

Source-of-record for each file, per-figure provenance, and the reconstruction
assumptions behind the numbers. This is a **literary** story: the underlying
"data" is a poem, and the geography is contested by design. These notes exist
so no figure reads as more certain than it is.

## `voyage_stops.csv`

**Primary source:** Homer, *Odyssey*, Books 9–13 (Perseus / Murray-Loeb;
Poetry in Translation / Kline; Theoi). Structure and identifications
cross-checked against Wikipedia's "Geography of the Odyssey" and the named
scholars' books.

**Coordinates** are decimal degrees (WGS84). For `anchor` sites they are the
archaeological location; for everything else they are the *traditional*
candidate's location and are illustrative, not proven:

| seq | Site | Coord basis | Status |
|---|---|---|---|
| 0 | Troy | Hisarlik mound (Troy VI/VIIa) | `anchor` |
| 1 | Ismaros | Maroneia, Thrace; acropolis on Agios Georgios Hill | `anchor` |
| 2 | Cape Malea | The real headland at the SE tip of the Peloponnese | `real-navigation` |
| 3 | Lotus-Eaters | Djerba/Meninx (traditional); Severin: Cyrenaica | `contested` |
| 4 | Cyclops | Sicily near Etna / Aci Trezza (traditional) | `contested` |
| 5 | Aeolus | Lipari (traditional); Severin: Gramvousa | `contested` |
| 6 | Laestrygonians | coord = Severin's Mezapos bay, Mani | `contested` |
| 7 | Circe | Monte Circeo, Lazio | `traditional` |
| 8 | Underworld | Necromanteion, Acheron, Thesprotia | `archaeological-contested` |
| 9 | Sirens | Li Galli / Sirenuse | `traditional` |
| 10 | Scylla & Charybdis | Strait of Messina | `traditional` |
| 11 | Thrinacia | Sicily ("Trinakria") | `contested` |
| 12 | Calypso | Gozo, Calypso's Cave above Ramla Bay | `traditional` |
| 13 | Phaeacians | Corcyra / Corfu | `traditional` (strong, since Thucydides) |
| 14 | Ithaca | Modern Ithaki | `anchor-contested` |

### Fleet and crew (`ships_after`, `men_after`) — RECONSTRUCTED

The "720 men / 12 ships" figure is a standard reconstruction (12 ships × ~60),
not a verbatim textual quantity — Homer is not perfectly explicit and
translations vary. Only the **loss events** are explicit:

- Cicones: "six men per ship" lost → 12 × 6 = **72**. `648` remain.
- Cyclops: Polyphemus eats **6** of Odysseus's men. `642` remain.
- Laestrygonians: **11 of 12 ships** destroyed with all crews; only Odysseus's
  moored ship escapes. At ~54/ship after the Cicones, that is ~594 men — the
  single greatest loss. `~48` remain on one ship. Ships: 12 → **1**.
- Scylla: **6** men, one per head. `~40` remain.
- Thrinacia: **all remaining crew** die when Zeus destroys the ship; only
  Odysseus survives. Men → **1**; ships → **0**.

The intermediate men-remaining values (`648, 642, 48, 46, 40`) therefore
depend on the ~60-per-ship assumption and are flagged reconstructed in the
chart `_meta.note`. Elpenor (who falls from Circe's roof) is folded into the
post-Laestrygonian count rather than shown separately.

### Gotchas

1. **Cape Malea is a pivot, not a stop** — `duration_days = 0`. It is the
   hinge Stanford marks, included so the map can dissolve there.
2. **Ships "after" Ithaca is 0** because Odysseus arrives on a *Phaeacian*
   ship, not his own; his last vessel died at Thrinacia.
3. **Two book numbers for Calypso** (`1,5`) because she appears both in the
   opening frame (Book 5) and in the poem's chronology.

## `route_theories.csv`

**Sources:** Strabo (*Geography* Bk 1) and Polybius (*Histories* Bk 34) for
the ancient/traditional set; Bérard, *Les Navigations d'Ulysse* (1927–29);
Bradford, *Ulysses Found* (1963); Severin, *The Ulysses Voyage* (1987);
Apollodorus of Athens and Crates of Mallus for the Atlantic reading.

`east_lon` is fixed at **23.19** for every school — the Cape Malea pivot,
where all routes agree and after which they diverge. `west_lon` is the
approximate westernmost reach of each school (Severin ~19.3°E near Greece;
Traditional ~12°E in Sicily; Bradford ~8°E; Bérard −5.6°E at Gibraltar;
Atlantic −15°E into the ocean). These are illustrative spans for the layer
toggle, not precise boundaries.

## `episode_identifications.csv`

The per-episode, per-school rival IDs that feed the `route-theories` scatter.
Longitudes are the traditional candidate coordinates from `voyage_stops.csv`
and the scholars' books. Rows with a blank `lat`/`lon` and `status = imaginary`
are the Atlantic/fringe placements, which have no real coordinate by design.

**Gotcha:** a few coordinates recur across schools (e.g. Djerba appears for
both Traditional and Bérard; Li Galli for Traditional and Bradford) — that is
real agreement, not a duplication error. The natural key is
`(seq, theory, proposed_place)`.

## `timeline_allocation.csv`

**Source:** durations stated or implied in the *Odyssey*, assembled into a
day-count for the `detention-paradox` chart.

| Phase | Days | Textual basis |
|---|---|---|
| Circe | 365 | "a full year" (Bk 10) |
| Calypso | 2,555 | "seven years" (Bks 5, 7) = 7 × 365 |
| Aeolus + near-miss | 40 | one month hosted + nine days' sail nearly home |
| Thrinacia | 35 | "over a month" storm-bound (Bk 12) |
| Ogygia → Scheria | 20 | 17 days' sail + storm (Bk 5) |
| Drift to Lotus-Eaters | 11 | 2 days beached + 9 days' drift (Bk 9) |
| others | 1–7 | "a few days," "brief," "a day's visit" |

`share_of_decade_pct` is each phase's days over ~3,650 (ten years). Calypso
alone is ~70%; Circe + Calypso ≈ 80%. **Gotcha:** the shares do not sum to
100 — the ten "years" are approximate in the text (the two detentions plus the
weeks of voyaging do not tile a clean 3,650-day grid), and the small voyaging
legs round to 0.0%. Treat the percentages as proportional, not exact.

## `distances.csv`

**Sources:** Harry Mount, *Harry Mount's Odyssey* (BOAT International) for the
565 nm straight-line figure and the modern-vessel comparisons; Severin, *The
Ulysses Voyage* (1987) for the drift argument and the re-sail time; Hal Roth,
*We Followed Odysseus*, for the two-year 35-ft-sloop re-sail.

- **565 nm** is straight-line ("as the crow flies"); the actual
  coast-following wandering routes run to "several thousand miles." Always
  state which you mean.
- **The nine-day blow, two ways.** Traditional reading: a galley under sail
  makes 70–100 nm/day → 630–900 miles in nine days → a Tunisia landfall.
  Severin's reading: a homesick crew *fighting* to hold position drifts only
  ~30 nm/day → ~270 miles → Libya (Cyrenaica), roughly due south of Cape
  Malea. The CSV stores 810 nm and 270 nm as the two midpoint figures.
- **Severin re-sail = ~120 days** (the "3–4 month" single season), stored for
  the `distance-vs-time` chart; Odysseus = 3,650 days (ten years).

**Gotcha — the galley spec conflict.** Wikipedia gives Severin's *Argo* as
54 ft / 16.5 m with ~20 oars; a local Kytherian account gives 14 m / 22
rowers. The `distances.csv` "Severin re-sail" row records only the *duration*
(4 months), which is not in dispute. Confirm the length/oar figures against
the *Ulysses Voyage* text before publishing a precise number anywhere.

## `wine_dark_palette.csv`

**Sources:** Wikipedia, "Wine-dark sea"; W. E. Gladstone, *Studies on Homer
and the Homeric Age* (1858).

- *oînops* ("wine-faced") is attested **17×** in Homer (5 in the *Iliad*, 12
  in the *Odyssey*), always of the sea — and, tellingly, twice of oxen.
- Homer's wine is only ever *erythros* ("red") or *melas* ("black"); white
  wine seems absent from his world.
- *kyanós* (later "blue") describes the eyebrows of Zeus and there means
  "dark," not blue — Gladstone's central observation.

The six hex values are an **editorial palette** built to run deep burgundy →
indigo → slate, per the design brief; they are not claimed as reconstructions
of any ancient pigment.

## Quotations (use verbatim, with attribution)

These are the only quotes cleared for the story. Do not paraphrase them as if
textual, and do not invent others.

- **Stanford** (1947, on *Od.* 9.80–81): "These are the last clearly
  identifiable places in O.'s wanderings. After this he leaves the sphere of
  Geography and enters Wonderland."
- **Eratosthenes** (via Strabo, *Geography* 1.2.15): "You will find the scene
  of the wanderings of Odysseus when you find the cobbler who sewed up the bag
  of the winds."
- **Merry & Riddell** (on Bks 9–12): "Throughout these books we are in a
  wonderland, which we shall look in vain for on the map."
- **Diggle** (Antigone, 5 Jul 2026): "Homer has many opportunities to call
  Ithaca an island, but he never does so."

## Source-quality flags

- Much online route material comes from **travel/tourism sites** (amplified by
  the 2026 Nolan-film publicity) and is illustrative only. Anchor claims to the
  primary text, Wikipedia's "Geography of the Odyssey," and the named scholars'
  books.
- The **Necromanteion**'s Homeric identification is contested on dating grounds
  (ruins no earlier than the later 4th c. BCE; possibly a fortified farmhouse).
- The **Ithaca/Paliki** debate is live: the 2026 Diggle/Underhill work
  undercuts Bittlestone's "separate island" premise while still favouring
  "Ithaca = part of Kefalonia." Keep it a caveat, not a conclusion.
