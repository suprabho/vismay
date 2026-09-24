/** Check for fitChartToWidth — flint's pixel-pinned side legend re-flowed to
 *  the rendered width.
 *  (run: npx tsx src/lib/chartFit.test.ts) */
import type { EChartsOption } from 'echarts'
import { fitChartToWidth } from './chartFit'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

// Shape flint emits for a lollipop with a colour channel.
const flint = (): EChartsOption =>
  ({
    grid: { top: 36, left: 86, right: 167, bottom: 103 },
    legend: { top: 20, left: 310, orient: 'vertical', align: 'left', data: ['Other', 'Mercedes (ANT)', 'McLaren (NOR)'] },
    graphic: [{ type: 'text', left: 310, top: 4, style: { text: 'Highlight', fill: '#333' } }],
  }) as EChartsOption

type Obj = Record<string, unknown>

// Narrow: legend folds into a centered row, title dropped, plot widened + pushed down.
{
  const out = fitChartToWidth(flint(), 340, { muted: '#999' }) as Obj
  const legend = out.legend as Obj
  const grid = out.grid as Obj
  ok('narrow: legend horizontal + centered', legend.orient === 'horizontal' && legend.left === 'center')
  ok('narrow: no pixel left/align left on legend', !('align' in legend))
  ok('narrow: legend title graphic dropped', (out.graphic as unknown[]).length === 0)
  ok('narrow: grid.right shrinks', grid.right === 16)
  ok('narrow: grid.top clears the legend row(s)', (grid.top as number) >= 42, String(grid.top))
}

// Wide: legend + title pinned to the reserved column at the real width; title themed.
{
  const out = fitChartToWidth(flint(), 800, { muted: '#999' }) as Obj
  const legend = out.legend as Obj
  const title = (out.graphic as Obj[])[0]
  ok('wide: legend stays vertical', legend.orient === 'vertical')
  ok('wide: legend left = width - grid.right + 12', legend.left === 800 - 167 + 12, String(legend.left))
  ok('wide: title follows legend', title.left === legend.left)
  ok('wide: title recoloured', (title.style as Obj).fill === '#999')
  ok('wide: grid untouched', (out.grid as Obj).right === 167)
}

// Pass-through: unmeasured width, or no pixel-pinned legend.
{
  const o = flint()
  ok('width 0 → same object', fitChartToWidth(o, 0) === o)
  const plain = { legend: { top: 0, left: 'center' } } as EChartsOption
  ok('non-flint legend → same object', fitChartToWidth(plain, 300) === plain)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall passed')
