# `plot:` JSON schema (Observable Plot)

The D3-family parallel to the ECharts `data:` path. A chart id of `plot:<id>`
routes to `GenericPlot`, which fetches `/api/chart-data/<slug>/<id>` and renders
the returned JSON with [Observable Plot](https://observablehq.com/plot/).

This is the same endpoint the ECharts `data:` charts use — only the JSON shape
and the renderer differ. Authors pick the format per chart; a story can mix
`data:` and `plot:` charts freely.

## Top-level shape

```jsonc
{
  "steps": [
    {
      "title": "optional caption shown under the chart",
      "plot": { /* Observable Plot options — see below */ }
    }
    // more steps; activeStep (scrolly) selects which one renders
  ]
}
```

`activeStep` selects the step, exactly like `data:` charts. Steps share the
container; switching re-renders with the new step's `plot`.

## The `plot` object

Everything Observable Plot's [`Plot.plot(options)`][plot-opts] accepts is valid
here **except `marks`**, which JSON can't express as function calls. Common keys:

| Key | Meaning |
|-----|---------|
| `width`, `height` | figure size (defaults: width 720 desktop / 360 mobile; Plot scales to 100% width) |
| `marginTop/Right/Bottom/Left`, `margin`, `inset*` | spacing |
| `grid` | `true` for both axes |
| `x`, `y`, `fx`, `fy`, `r`, `color`, `opacity`, `symbol`, `length` | [scale options][scales] (`label`, `domain`, `type`, `range`, `scheme`, `legend`, `tickFormat`, …) |
| `style` | CSS object merged over the engine defaults (transparent bg, theme text color, mono font) |
| `marks` | **required** — array of mark specs (below) |

[plot-opts]: https://observablehq.com/plot/features/plots
[scales]: https://observablehq.com/plot/features/scales

## Marks

Each mark is `{ "type": <name>, "data"?: [...], "options"?: {...} }`.

- `data` — the rows for the mark (array of objects or values). Omit for
  option-only marks (`frame`, `gridX`, `gridY`).
- `options` — the mark's channel/style options. Channel values are usually
  **field names** in `data` (`"x": "gdp"`); literal colors use the `$token`
  convention (`"fill": "$accent"`).

Supported `type` values:

- Data marks: `dot`, `dotX`, `dotY`, `line`, `lineX`, `lineY`, `area`, `areaX`,
  `areaY`, `barX`, `barY`, `rect`, `rectX`, `rectY`, `cell`, `cellX`, `cellY`,
  `tickX`, `tickY`, `text`, `textX`, `textY`, `ruleX`, `ruleY`, `link`, `arrow`,
  `vector`, `boxX`, `boxY`, `tip`
- Option-only marks: `frame`, `gridX`, `gridY`

Unknown mark types are skipped with a console warning rather than throwing.

## Color tokens

Any string starting with `$` is replaced with the live theme value before
rendering (same convention as `data:` charts), so swapping a story's theme
reflows the chart. Resolved keys include the `ChartColors` palette (`$accent`,
`$accent2`, `$teal`, `$green`, `$amber`, `$red`, `$muted`, `$line`, `$surface`)
plus CSS vars (`$bg`/`$background`, `$text`, `$positive`). Field names (no `$`)
pass through untouched.

## Mobile

On portrait/mobile viewports (`useIsMobile`) the dedicated `tip` mark is dropped
and any `tip: true` on other marks is removed — there's no hover surface there,
matching the ECharts tooltip suppression.

## Example

```json
{
  "steps": [
    {
      "title": "Capacity vs reserve life by region",
      "plot": {
        "height": 360,
        "marginLeft": 52,
        "grid": true,
        "x": { "label": "Capacity (M scf/yr) →", "type": "sqrt" },
        "y": { "label": "↑ Reserve life (yrs)" },
        "color": { "legend": true, "range": ["$accent", "$accent2", "$teal"] },
        "marks": [
          { "type": "ruleY", "data": [0] },
          { "type": "dot", "data": [{ "capacity": 1300, "life": 42, "region": "Qatar" }],
            "options": { "x": "capacity", "y": "life", "fill": "region", "r": 7, "tip": true } }
        ]
      }
    }
  ]
}
```

A live version of this exact spec is served by the catalog demo at
`apps/catalog/app/api/chart-data/[slug]/[id]/route.ts` and rendered on
`/d3-demo`.

## When to use `plot:` vs `data:`

See the decision tree in `d3-vs-echarts.md`. In short: `plot:` for bespoke,
editorial, SVG-first charts whose shape Observable Plot expresses cleanly;
`data:` for the dashboard staples ECharts excels at (candlestick, treemap,
dataZoom/brush, 5k+ marks).
