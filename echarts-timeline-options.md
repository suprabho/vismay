# Better ECharts timeline visualizations for the Galathea regulatory story

Your current chart is a `scatter` series on a category Y-axis — 11 dots scattered across 2021–2026, color-coded by event type. It reads as a *dot plot of events*, not as a *story*. The dots are isolated, equally weighted, and the color coding does most of the narrative work without ever being explained.

Below are six ECharts approaches that progressively shift the chart from "list of dots" toward "narrative artefact." All stay inside ECharts (native series, custom renderItem, combo charts) per your constraint. Each section explains *what narrative it serves*, how it maps to your specific events, the rough config, and tradeoffs.

A quick note on what your data is actually saying — four narrative threads run through your 11 events, and most of the options below try to surface them:

- Protections removed (red, 3 events): Sanctuary denotified · ESZ → zero · FCA Amendment
- Conflicting signals (amber, 2 events): NMTAP listing · Tribal Council NOC withdrawn
- Project planning (1 event): AECOM pre-feasibility
- Project clearances (5 events): Stage-I forest · EC · 13th Major Port · NGT · PPPAC

The story is *"first the protections were dismantled, then the clearances rolled in, and the friction was overruled."* No current visualization makes that arc visible.

---

## Option 1 — Swimlanes by event category (custom renderItem)

**Narrative it serves:** This is the single biggest upgrade you can make for storytelling. Instead of one shared row per event, you split the canvas into 3–4 horizontal lanes by category — "Protections removed," "Project clearances," "Friction," "Planning." The viewer immediately sees that the red lane fires three times (twice clustered in early 2021, once in 2023), the green lane fires five times in a continuous march from late 2022 to 2026, and the amber lane fires twice as the project advances.

You're effectively turning a 1D timeline into a 2D *event taxonomy over time*. This is exactly what The Pudding, FT Visual, and Reuters do for regulatory and political timelines.

**How it maps to your data:** Y-axis becomes a category axis with 4 lanes. Each event keeps its date but moves to its lane. You'd add a `category` field to each event in your JSON.

**Implementation sketch:**

```js
yAxis: {
  type: 'category',
  data: ['Planning', 'Project clearances', 'Friction', 'Protections removed']
},
xAxis: { type: 'time' },
series: [{
  type: 'custom',
  renderItem: (params, api) => {
    const date = api.value(0);
    const lane = api.value(1);
    const point = api.coord([date, lane]);
    const laneHeight = api.size([0, 1])[1];
    return {
      type: 'group',
      children: [
        { type: 'circle', shape: { cx: point[0], cy: point[1], r: 7 },
          style: { fill: api.visual('color') } },
        { type: 'text', style: { text: api.value(2), x: point[0] + 12, y: point[1] - 6,
          fill: '#333', fontSize: 11 } }
      ]
    };
  },
  encode: { x: 0, y: 1, tooltip: [0, 1, 2] },
  data: [
    ['2021-01-15', 'Protections removed', 'Sanctuary denotified'],
    ['2021-01-18', 'Protections removed', 'ESZ → zero'],
    ['2021-02-01', 'Friction',           'NMTAP listing'],
    // ...etc
  ]
}]
```

The same effect is roughly achievable without `custom` by using a regular `scatter` against a category Y-axis with 4 categories — but `custom` gives you per-event label control and lets you stack events that share the same week (e.g., Oct 27 forest clearance + Nov 11 EC) without overlap.

**Tradeoffs:** Adds 30–50 lines of code. Requires you to commit to a taxonomy, which can become a debate. Lane order matters — narratively, "Protections removed" at the top reads as the *prerequisite* for what follows below.

**Reference:** [Custom Series — ECharts Handbook](https://echarts.apache.org/handbook/en/how-to/custom-series/) · pattern is the same as the [custom-gantt-flight example](https://echarts.apache.org/examples/en/editor.html?c=custom-gantt-flight) but with circles instead of bars.

---

## Option 2 — Annotated "regulatory momentum" line + event markers (combo chart)

**Narrative it serves:** This option reframes the chart entirely. Instead of dots, you plot a *step line* showing "cumulative project advancement score" (e.g., +1 for each clearance, −1 for each setback, 0 for neutral). The line visually rises through 2022–2026, with two dramatic dips where setbacks happen. Each event becomes a `markPoint` annotation on the line.

The viewer doesn't see "11 dots" — they see "a project that was repeatedly cleared, climbed despite friction, and is now fully approved." It's the same data, but the line carries the meaning that the dots can't.

**How it maps to your data:** You compute a running score per event and use `line` + `markPoint`. The score values are editorial — you choose the weights.

**Implementation sketch:**

```js
series: [
  {
    type: 'line',
    step: 'end',
    smooth: false,
    showSymbol: false,
    data: [
      ['2021-01-15', -1], ['2021-01-18', -2], ['2021-02-01', -2],
      ['2021-03-15', -2], ['2022-10-27', -1], ['2022-11-11', 0],
      ['2022-11-22', 0],  ['2023-08-04', -1], ['2024-09-15', 0],
      ['2026-02-16', 1],  ['2026-03-15', 2]
    ],
    lineStyle: { width: 3, color: '#888' },
    markPoint: {
      symbol: 'pin', symbolSize: 50,
      data: [
        { name: 'Sanctuary denotified', coord: ['2021-01-15', -1], itemStyle: { color: '#c0392b' } },
        { name: 'EC issued',            coord: ['2022-11-11',  0], itemStyle: { color: '#27ae60' } },
        // ...etc
      ],
      label: { formatter: '{b}', position: 'top', distance: 8 }
    },
    markArea: {
      itemStyle: { color: 'rgba(192, 57, 43, 0.08)' },
      data: [[{ xAxis: '2022-12-01', name: 'Legal challenge period' }, { xAxis: '2026-02-16' }]]
    }
  }
]
```

`markArea` is the secret weapon here — you can shade the "legal challenge period" (Nov 2022 EC → Feb 2026 NGT) as a soft band, which silently tells the viewer "this whole stretch was contested" without writing a word of body copy.

**Tradeoffs:** The score is editorialized — be ready to defend the weights. Marker labels collide easily if events are close in time (Jan 15 / Jan 18 / Feb 1 will overlap). Mitigate with `label.distance` and `label.position: ['top', 'bottom', 'top']` alternation.

**Reference:** `markPoint`, `markArea`, and `markLine` are all documented in [Chart Configuration — option](https://echarts.apache.org/en/option.html). Real-world use in [Sanjay Nelagadde — Stop Making Boring Data Dashboards](https://medium.com/data-has-better-idea/stop-making-boring-data-dashboards-how-i-built-interactive-charts-in-react-with-echarts-4a9568f4ba3c).

---

## Option 3 — Gantt-style range bars for contested periods (custom renderItem)

**Narrative it serves:** Some of your events are not really *points* — they're *the start of something that lasted*. The EC issued Nov 2022 was contested until the NGT upheld it Feb 2026. The Tribal Council NOC was withdrawn Nov 2022 and that consent has not been restored. Render these as horizontal bars instead of dots, and a third dimension of the story (*duration of uncertainty*) appears.

**How it maps to your data:** You annotate select events with an `end` date and render them as bars; pure-point events stay as markers. The chart becomes a mixed milestone/Gantt hybrid.

**Implementation sketch:** ECharts 6 ships a registerable `barRange` custom series exactly for this — install `@echarts-x/custom-bar-range` and you can use `renderItem: 'barRange'` directly without writing any renderItem code:

```js
series: [{
  type: 'custom',
  renderItem: 'barRange',   // ECharts 6 registerable
  data: [
    ['EC contested in NGT',         '2022-11-11', '2026-02-16'],
    ['NOC withdrawn (unresolved)',  '2022-11-22', '2026-03-15'],
    ['FCA Amendment in force',      '2023-08-04', '2026-03-15']
  ],
  itemPayload: { barWidth: 16, borderRadius: 4 },
  encode: { x: [1, 2], y: 0 }
}]
```

Pre-ECharts-6 (or if you want full control), write your own `renderItem` returning a `type: 'rect'` from `api.coord([start, y])` to `api.coord([end, y])` — that's exactly what the [custom-gantt-flight example](https://github.com/jsteffensen/echarts-gantt/blob/master/custom-gantt-flight.html) does.

**Tradeoffs:** You have to decide which events have meaningful "durations" — over-applying this turns every point into a rectangle that ends at "today" and the chart becomes a sea of bars. Best used as a *layer* on top of Option 1 or 2, not as the whole chart.

**Reference:** [echarts-custom-series/barRange](https://github.com/apache/echarts-custom-series/tree/main/custom-series/barRange) · [Custom Series handbook](https://echarts.apache.org/handbook/en/how-to/custom-series/).

---

## Option 4 — Phased timeline (native `timeline` component)

**Narrative it serves:** Break the 2021–2026 arc into 3–4 *acts* — "Act I: Protections dismantled (Jan 2021–Aug 2023)," "Act II: Clearances stack up (Oct 2022–Sep 2024)," "Act III: Legal challenge resolved (Aug 2023–Mar 2026)." The `timeline` component renders a horizontal player at the top of the chart; clicking each phase replaces the chart's options. The viewer steps through the story.

This is unusual for regulatory timelines and works best when you *want* the viewer to slow down and read each act. Less useful for at-a-glance briefings.

**How it maps to your data:** Each act becomes an entry in `options[]`, and the chart's data filters to only the events in that phase. You can keep all 11 visible but highlight the active act's events.

**Implementation sketch:**

```js
{
  baseOption: {
    timeline: {
      axisType: 'category',
      data: ['Act I — Protections dismantled', 'Act II — Clearances begin',
             'Act III — Legal challenge resolved'],
      autoPlay: false,
      playInterval: 4000
    },
    xAxis: { type: 'time', min: '2020-11-01', max: '2026-06-01' },
    yAxis: { type: 'category', data: [...] },
    series: [{ type: 'scatter', symbolSize: 14 }]
  },
  options: [
    { title: { text: 'Act I (Jan 2021 – Aug 2023)' },
      series: [{ data: act1Events }] },
    { title: { text: 'Act II (Oct 2022 – Sep 2024)' },
      series: [{ data: act2Events }] },
    { title: { text: 'Act III (Aug 2023 – Mar 2026)' },
      series: [{ data: act3Events }] }
  ]
}
```

**Tradeoffs:** The `timeline` component is *confusingly named* — it's a *step-through controller*, not a chart type. Many ECharts users discover this the hard way. Don't use it unless you genuinely want a temporal slideshow.

**Reference:** Discussion of the naming confusion in [Issue #13327](https://github.com/apache/echarts/issues/13327).

---

## Option 5 — Cause-and-effect graph overlay (`graph` series on Cartesian)

**Narrative it serves:** This is the most explicitly narrative option. You position each event on a time axis but draw *arrows* between events that have a causal relationship. FCA Amendment 2023 → enabled Major Port notification 2024. Sanctuary denotified Jan 2021 → enabled Stage-I forest clearance Oct 2022. The chart becomes a visible *chain of consequence*.

ECharts' `graph` series supports `coordinateSystem: 'cartesian2d'`, which means nodes can be placed at `[date, y]` and edges drawn between them — turning a time chart into a directed graph.

**How it maps to your data:** You add an `edges` array describing causal links (this is editorial work, not in your JSON today). Each event becomes a node; each causal link becomes a curved arrow.

**Implementation sketch:**

```js
series: [{
  type: 'graph',
  coordinateSystem: 'cartesian2d',
  symbolSize: 14,
  edgeSymbol: ['none', 'arrow'],
  lineStyle: { curveness: 0.2, color: '#888' },
  data: [
    { id: 'sanctuary', value: ['2021-01-15', 1], name: 'Sanctuary denotified' },
    { id: 'forest',    value: ['2022-10-27', 1], name: 'Stage-I forest clearance' },
    { id: 'fca',       value: ['2023-08-04', 1], name: 'FCA Amendment' },
    { id: 'port',      value: ['2024-09-15', 1], name: 'Major Port notified' },
    // ...
  ],
  links: [
    { source: 'sanctuary', target: 'forest' },
    { source: 'fca',       target: 'port' },
    { source: 'esz',       target: 'forest' }
  ]
}]
```

**Tradeoffs:** Causal claims are editorial and contestable — every arrow is an argument. Arrows can also clutter quickly if you draw more than ~8 links. Best used sparingly to highlight 3–5 *clearly defensible* causal chains, not as a dense network.

**Reference:** [graph series documentation](https://echarts.apache.org/en/option.html#series-graph) supports `cartesian2d` coordinate system. Highlighting connected nodes on hover is a built-in feature noted in [ECharts 5 release notes](https://apache.github.io/echarts-handbook/en/basics/release-note/v5-feature/).

---

## Option 6 — Vertical narrative timeline with rich labels (custom renderItem)

**Narrative it serves:** Rotate the whole thing 90°. Time runs top-to-bottom, events alternate left and right of the axis with full descriptions — the format Wikipedia, Pitchfork, and most news outlets use for editorial timelines. You can fit 3–4 lines of body copy per event without cramping. Reads like an article, not a chart.

**How it maps to your data:** X-axis becomes a category axis with two columns ("left," "right"); Y-axis becomes time inverted. Each event renders as a card via `custom` renderItem.

**Implementation sketch:**

```js
yAxis: { type: 'time', inverse: true, min: '2020-11-01', max: '2026-06-01' },
xAxis: { type: 'value', min: -1, max: 1, show: false },
series: [{
  type: 'custom',
  renderItem: (params, api) => {
    const side = api.value(0);   // -1 left, +1 right
    const date = api.value(1);
    const point = api.coord([side, date]);
    return {
      type: 'group',
      children: [
        { type: 'circle', shape: { cx: api.coord([0, date])[0], cy: point[1], r: 6 },
          style: { fill: api.visual('color') } },
        { type: 'rect', shape: { x: point[0] - 80, y: point[1] - 24, width: 160, height: 48 },
          style: { fill: '#fff', stroke: '#ddd' } },
        { type: 'text', style: { x: point[0], y: point[1], text: api.value(2),
          textAlign: 'center', textVerticalAlign: 'middle' } }
      ]
    };
  },
  data: [
    [-1, '2021-01-15', 'Galathea Bay Sanctuary denotified'],
    [ 1, '2021-01-18', 'Galathea NP ESZ reduced to zero'],
    // ...alternating sides
  ]
}]
```

**Tradeoffs:** Eats vertical space — works for a dedicated page or scrolling article, not a dashboard tile. Tooltips become less important because the body copy is already on screen. You lose the at-a-glance "all 11 events at once" property.

**Reference:** Same `custom` renderItem API as Option 1; no special component needed.

---

## Recommendation

For a regulatory timeline whose story is *"first protections fell, then clearances rolled in,"* I'd combine **Option 1 (swimlanes) as the base structure** with **Option 2's `markArea`** to shade the contested EC period (Nov 2022 → Feb 2026). That gives you:

- Four lanes that physically separate the four story threads
- A soft red band behind the entire "legal challenge" stretch
- Each event still a single, clean marker — no Gantt rectangles, no editorial causal arrows
- Roughly 60 lines of additional config over your current chart

Reserve Option 3 (Gantt bars) and Option 5 (causal arrows) for a *second*, deeper editorial chart further down the page — they're too argumentative to lead with. Option 6 (vertical) is the right call if this lives in an article rather than a dashboard. Option 4 (phased) is a presentation tool, not a chart, and I'd skip it unless you're literally narrating the story aloud.

---

## Things to test before committing

- Label collision in Jan-Feb 2021 (three events in 17 days) — try `label.distance` alternation or a custom collision-avoidance pass in renderItem.
- Performance is not a concern at 11 events, but if this template grows past ~200 events the custom series options get noticeably faster than `scatter` with rich labels.
- ECharts 6 introduced the registerable custom series — check what version of ECharts your renderer is on before relying on `renderItem: 'barRange'`. Pre-6, you write the renderItem inline.

Sources:
- [Custom Series — ECharts Handbook](https://echarts.apache.org/handbook/en/how-to/custom-series/)
- [ECharts custom-gantt-flight example](https://echarts.apache.org/examples/en/editor.html?c=custom-gantt-flight) · [source on GitHub](https://github.com/jsteffensen/echarts-gantt/blob/master/custom-gantt-flight.html)
- [Apache echarts-custom-series — barRange](https://github.com/apache/echarts-custom-series/tree/main/custom-series/barRange)
- [ECharts 5 storytelling release notes](https://apache.github.io/echarts-handbook/en/basics/release-note/v5-feature/)
- [Apache ECharts option reference](https://echarts.apache.org/en/option.html)
- [Visual Mapping concept (categories)](https://apache.github.io/echarts-handbook/en/concepts/visual-map/)
- [Issue #13327 — Timeline Chart vs timeline component](https://github.com/apache/echarts/issues/13327)
- [Sanjay Nelagadde — Building interactive ECharts dashboards](https://medium.com/data-has-better-idea/stop-making-boring-data-dashboards-how-i-built-interactive-charts-in-react-with-echarts-4a9568f4ba3c)
