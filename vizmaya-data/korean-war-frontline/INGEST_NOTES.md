# Ingest notes — korean-war-frontline

## Provenance

- **Dates and operations** — US Army Center of Military History (CMH) campaign
  brochures (five phases), Truman Library chronology, and the standard narrative
  histories (Halberstam, *The Coldest Winter*; Hastings, *The Korean War*;
  Fehrenbach, *This Kind of War*).
- **Frontline positions** — redrawn by hand from CMH and West Point Atlas
  campaign maps into lon/lat polylines (`frontlines.csv`). Indicative, not
  surveyed. The front was rarely continuous; the November 1950 line in
  particular had a ~100 km mountain gap between Eighth Army (west) and X Corps
  (east) that the single line papers over.
- **Coastline** — Natural Earth 1:10m admin-0 (North + South Korea). Carried
  over from the September 2026 single-file prototype (`korean-war-frontline.html`),
  where it had been pre-projected to Mercator; inverted back to lon/lat with a
  two-parameter fit against thirteen gazetteer cities (residuals < 0.02°, the
  38th parallel lands at 38.000°).
- **Area shares** (`beats.csv`, `held_by_north_pct`) — land north of each line as
  a fraction of the whole peninsula, computed in the prototype from Natural
  Earth boundaries. Treat as ±2 points: sensitive to exactly where a line meets
  the coast. The build script recomputes the share from the finished polygon
  (equal-area plane, islands excluded from the denominator) and prints both;
  current agreement is within 1 point on every beat.
- **Frontline travel** (`front-movement.json`) — shift in each line's mean
  latitude between consecutive beats × 111 km, summed. Year one sums to
  ≈1,400 km, which matches the brief's figure. It is an index of movement, not
  a distance marched; it understates the Pusan beat (the line ran north–south).

## Build method (`scripts/build-geojson.mjs`)

1. Stitch the NK and SK rings into one peninsula ring along their shared DMZ
   vertices; simplify the coast (Douglas–Peucker, 0.6 km).
2. Resample each polyline to 120 points in a km-scaled Mercator plane.
3. Find the first coast crossing from each end; the trimmed line plus the ring
   arc that passes through the northernmost vertex is the `held-<beat>`
   polygon (land north of the line, closed along the coast and the Yalu/Tumen).
4. Offset the trimmed line ±2.5 km for the `front-<beat>` strip.
5. Emit `parallel-38` as an alias of `front-parallel` so every section can keep
   the reference line without re-listing beat 1.

## Things to decide before publishing

1. **Precision of the lines.** For a published piece, digitise the CMH maps
   properly (QGIS georeference → trace) rather than the hand-placed polylines.
   Data change only — see README.
2. **Casualty channel.** A third layer — casualties per phase — would sharpen
   "Two years for a few hills" (the stalemate accounts for roughly half of US
   and UN deaths). Needs a defensible source per phase; CMH gives totals but
   phase splits vary.
3. **Seoul counter.** A "Seoul: 1st / 2nd / 3rd / 4th change of hands" marker on
   beats 2, 4, 7, 8 is currently carried in pin labels only.
4. **Kumsong.** The final Chinese offensive (13–20 Jul 1953) flattened the ROK
   bulge east of Kumhwa; the built armistice line shows the post-Kumsong
   position. A beat between 11 and 12 would be the place to show it.
5. **Language.** Place names use 1950s McCune-Reischauer forms (Pusan, Inchon,
   Taegu), flagged in the story's methodology note.

## Key confirmed dates

Invasion 25 Jun 1950 · Seoul falls 28 Jun · Osan 5 Jul · Pusan Perimeter
4 Aug–18 Sep · Inchon 15 Sep · Seoul retaken 28 Sep · ROK crosses parallel
1 Oct · Pyongyang 19 Oct · ROK at Chosan 26 Oct · Chinese first phase 25 Oct ·
MacArthur's final offensive 24 Nov · Chinese second phase 25 Nov · Chosin
27 Nov–13 Dec · Hungnam evacuation complete 24 Dec · Seoul falls again
4 Jan 1951 · Ridgway's line ~24 Jan · Seoul retaken mid-Mar · MacArthur relieved
11 Apr · Chinese spring offensive 22 Apr–22 May · Kansas–Wyoming held by
mid-Jun · talks open 10 Jul 1951 at Kaesong, move to Panmunjom 25 Oct 1951 ·
armistice 27 Jul 1953.
