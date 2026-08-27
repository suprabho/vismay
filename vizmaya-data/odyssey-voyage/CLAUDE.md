# CLAUDE.md — Project scope

## What this project is

A **literary-geography visualization story** for Vizmaya.fyi that maps
Odysseus's ten-year homeward voyage (Troy → Ithaca) against real Mediterranean
geography — and against the fact that most classicists treat the wanderings as
imaginary.

The deliverable is editorial Markdown, CSV, and JSON — a data story for
general readers. The spine is not the map but the **detention paradox**: a
~565-nautical-mile trip, a week or two under sail, that Homer stretches into
ten years — of which ~80% is spent detained (one year with Circe, seven with
Calypso), not sailing.

## The framing that governs everything

The narrative pivot is **Cape Malea**. Odysseus is a real, mappable navigator
up to that southern Peloponnesian headland; a north wind then blows him into
the fantastical. Stanford (1947): "After this he leaves the sphere of
Geography and enters Wonderland."

So the cardinal rule of this story:

> **Never present a single post-Malea route as true.** Present the competing
> reconstructions as *layers*. Tag every landfall with its `id_status`.

Per Wikipedia's "Geography of the Odyssey," the view that Odysseus's landfalls
are best treated as imaginary is probably held by the majority of classical
scholars today. This story shows the rival maps precisely to make that point,
not to pick a winner.

## Sources (the ones to use)

- **The primary text** — Homer's *Odyssey*, Books 9–13, via Perseus (Murray /
  Loeb), Poetry in Translation (Kline), or Theoi. Every duration, fleet number
  and loss event traces back here.
- **Ancient geographers** — Strabo (*Geography* Bk 1), Polybius (*Histories*
  Bk 34), Eratosthenes (via Strabo) for the ancient identifications and the
  ancient skepticism.
- **Modern reconstructions** — Bérard (*Les Navigations d'Ulysse*, 1927–29),
  Bradford (*Ulysses Found*, 1963), Severin (*The Ulysses Voyage*, 1987),
  Bittlestone (*Odysseus Unbound*, 2005), and the July 2026 Diggle/Underhill
  work.
- **Commentary** — Stanford (1947) for the "Wonderland" line; Merry & Riddell;
  Kakridis.
- **The motif** — Gladstone (1858) and Wikipedia's "Wine-dark sea" for the
  colour section.

Anchor claims to the primary text and the named scholars' own books, not to
travel/tourism sites (which proliferated around the 2026 Nolan-film publicity
and should be treated as illustrative only).

## What's in scope

- The 14 landfalls, their real-place candidates, coordinates and ID status.
- The timeline: where the ten years actually go (the detention paradox).
- Fleet and crew attrition (12 ships → 0; 720 men → 1), flagged as reconstructed.
- The competing schools of reconstruction, shown as layers.
- Distances and Bronze Age sailing reality (galley speed, drift math).
- The "wine-dark sea" colour/language motif and the Gladstone debate.
- Bronze Age context (c. 1200 BCE setting, c. 8th c. BCE composition, the Late
  Bronze Age Collapse) at a descriptive level.

## What's out of scope

- Asserting a single "true" route, or presenting any mythic-site coordinate as
  a proven location.
- Treating the reconstructed fleet numbers as exact textual quantities.
- Inventing quotations. Use only the attributed quotes in `story.yaml` /
  `INGEST_NOTES.md` (Stanford, Eratosthenes, Merry & Riddell, Diggle,
  Severin), verbatim, with attribution.
- Deep philological argument about Greek metre or oral-formulaic theory —
  keep it a data story for general readers.

## Honesty flags to keep on the page

- Every post-Malea site carries an `id_status` tag; the `contested` and
  `traditional` tags must remain visible, not smoothed away.
- The **Necromanteion** is the trickiest: it *is* excavated, but the ruins
  date no earlier than the later 4th c. BCE and some scholars call it a
  fortified farmhouse — so the Homeric link is contested even though the dig
  is real. Tag `archaeological-contested`, never plain "archaeologically
  proven."
- The **Ithaca / Paliki** debate is *live*: the 2026 Diggle/Underhill work
  undercuts Bittlestone's "separate island" premise while still favouring
  "Ithaca = part of Kefalonia." Caveat box, not a settled claim.
- The **Severin galley spec** has a minor source conflict (54 ft / ~20 oars vs
  a local 14 m / 22-rower figure) — confirm against the *Ulysses Voyage* text
  before publishing a precise number.

## Reporting cut-off

This is a literary subject with no live feed, so figures do not move. The
snapshot date in `story.yaml` (`data_cutoff`) marks when the scholarship —
notably the Ithaca/Paliki debate — was last checked, not a data refresh.
