import { NextResponse } from 'next/server'

/**
 * Demo-only chart-data endpoint for the catalog.
 *
 * The real app serves this from the content source (see vizmaya-fyi's
 * `createChartDataHandler`). Here it returns a static Observable Plot spec so
 * the `/d3-demo` page can exercise the `plot:<id>` path end to end. The shape
 * matches docs/generic-plot-schema.md in @vismay/viz-engine.
 */

const HELIUM = [
  { source: 'Ras Laffan 2', capacity: 1300, life: 42, region: 'Qatar' },
  { source: 'Ras Laffan 1', capacity: 660, life: 38, region: 'Qatar' },
  { source: 'Ras Laffan 3', capacity: 425, life: 35, region: 'Qatar' },
  { source: 'Cliffside', capacity: 880, life: 8, region: 'United States' },
  { source: 'Hugoton', capacity: 520, life: 12, region: 'United States' },
  { source: 'Riley Ridge', capacity: 360, life: 20, region: 'United States' },
  { source: 'Keyes', capacity: 230, life: 10, region: 'United States' },
  { source: 'Amur', capacity: 690, life: 30, region: 'Other' },
  { source: 'Arzew', capacity: 410, life: 18, region: 'Other' },
  { source: 'Darwin', capacity: 210, life: 15, region: 'Other' },
]

const SAMPLE_PLOT = {
  steps: [
    {
      title: 'Observable Plot rendered from JSON via plot:demo — colors use $tokens',
      plot: {
        height: 360,
        marginLeft: 52,
        marginBottom: 44,
        grid: true,
        x: { label: 'Production capacity (M scf/yr) →', type: 'sqrt' },
        y: { label: '↑ Estimated reserve life (yrs)' },
        color: { legend: true, range: ['$accent', '$accent2', '$teal'] },
        marks: [
          { type: 'ruleY', data: [0] },
          {
            type: 'dot',
            data: HELIUM,
            options: { x: 'capacity', y: 'life', fill: 'region', r: 7, stroke: '$bg', strokeWidth: 1, tip: true },
          },
          {
            type: 'text',
            data: HELIUM,
            options: { x: 'capacity', y: 'life', text: 'source', dy: -12, fontSize: 9, fill: '$muted' },
          },
        ],
      },
    },
  ],
}

export function GET() {
  return NextResponse.json(SAMPLE_PLOT)
}
