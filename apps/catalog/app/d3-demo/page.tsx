import { ChartPanel } from '@vismay/viz-engine'

/**
 * Standalone demo proving the D3 engine renders through the same dispatcher as
 * the ECharts charts. `beeswarm-example` is a registry entry whose chunk pulls
 * in d3-* (and never echarts), via ChartPanel's lazy code-split path.
 *
 * The two panels show the chart at different `activeStep` values to exercise
 * the scrolly-highlight contract shared with the ECharts charts.
 */
export default function D3DemoPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0b1116', color: '#e0ddd5', padding: 32 }}>
      <h1 style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, marginBottom: 4 }}>
        D3 ⋅ beeswarm-example
      </h1>
      <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, opacity: 0.7, marginBottom: 24 }}>
        Rendered via <code>&lt;ChartPanel chartId=&quot;beeswarm-example&quot; /&gt;</code> — D3 + React/SVG,
        code-split so this route never downloads ECharts.
      </p>

      <section style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr', maxWidth: 820 }}>
        <div style={{ height: 380, border: '1px solid #1a2830', borderRadius: 8, padding: 8 }}>
          <ChartPanel chartId="beeswarm-example" activeStep={0} />
        </div>
        <div style={{ height: 380, border: '1px solid #1a2830', borderRadius: 8, padding: 8 }}>
          <ChartPanel chartId="beeswarm-example" activeStep={1} />
        </div>
      </section>

      <h2 style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 16, margin: '40px 0 4px' }}>
        D3 ⋅ plot:demo (JSON-driven Observable Plot)
      </h2>
      <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, opacity: 0.7, marginBottom: 24 }}>
        Rendered via <code>&lt;ChartPanel chartId=&quot;plot:demo&quot; slug=&quot;demo&quot; /&gt;</code> — the spec is
        fetched as JSON from <code>/api/chart-data/demo/demo</code>, parallel to the ECharts <code>data:</code> path.
      </p>
      <section style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr', maxWidth: 820 }}>
        <div style={{ height: 420, border: '1px solid #1a2830', borderRadius: 8, padding: 8 }}>
          <ChartPanel chartId="plot:demo" slug="demo" activeStep={0} />
        </div>
      </section>
    </main>
  )
}
