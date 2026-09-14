# korean-war-frontline — source of record

Data behind the Vizmaya story **"Up and down the peninsula"**
(`apps/vizmaya-fyi/content/stories/korean-war-frontline.*`). Twelve positions of
the Korean War frontline, June 1950 → July 1953, plus the share of the peninsula
north of each line.

| File | What it is |
|---|---|
| `beats.csv` | One row per beat: id, order, date shown, line name, stated share held by the North, headline, ghost (previous beat drawn faintly) |
| `frontlines.csv` | Hand-placed lon/lat polylines, one per beat, west → east (`beat,seq,lon,lat`) |
| `cities.csv` | Place names used as map labels, with gazetteer coordinates where known |
| `korea-outline.geojson` | Natural Earth 1:10m North + South Korea as two rings sharing the DMZ edge (the build stitches them into one peninsula ring) |
| `scripts/build-geojson.mjs` | Builds `apps/vizmaya-fyi/public/data/korean-war-frontlines.geojson` from the above |
| `INGEST_NOTES.md` | Provenance, method, caveats, and the pre-publish checklist |

## Rebuild the map layer

```bash
node vizmaya-data/korean-war-frontline/scripts/build-geojson.mjs
```

Prints a table comparing the area share computed from each polygon against the
stated share in `beats.csv`; they should agree within ±2 points.

## Swapping in better geometry

Replace the rows for a beat in `frontlines.csv` (any number of points, west →
east, ends may sit out at sea — the build clips to land) and re-run the script.
The story config references feature ids only (`held-<beat>`, `front-<beat>`,
`parallel-38`), so nothing in the YAML changes.
