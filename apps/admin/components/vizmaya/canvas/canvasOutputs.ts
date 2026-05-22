import type { ResolvedUnit } from '@vismay/viz-engine'
import type { OutputNodeData } from './OutputNode'

/**
 * Derive the output subgraph for a section frame. Each output is a live
 * iframe pointed at vizmaya-fyi's existing render route, scoped to this
 * section via a `?section=<id>` query (or `?start=<id>` for autoplay,
 * which doesn't slice but seeks to the section).
 *
 * Native dimensions match each output's real export size — the iframe
 * renders at exactly w×h, so what's visible in the canvas IS what gets
 * exported. The canvas's pan+zoom scales them for viewing without
 * distorting the captured pixels.
 */
export function buildOutputsForUnit(
  unit: ResolvedUnit,
  slug: string,
  publicSiteUrl: string
): OutputNodeData[] {
  const sectionId = unit.parentConfig.id ?? `section-${unit.parentIndex}`
  const base = publicSiteUrl.replace(/\/$/, '')
  const slugPath = encodeURIComponent(slug)
  const sectionParam = encodeURIComponent(sectionId)

  return [
    {
      id: `${sectionId}:share-3-4`,
      label: 'Share 3:4',
      tag: '1080 × 1440',
      src: `${base}/story/${slugPath}/share?ratio=3:4&section=${sectionParam}`,
      w: 1080,
      h: 1440,
    },
    {
      id: `${sectionId}:share-1-1`,
      label: 'Share 1:1',
      tag: '1080 × 1080',
      src: `${base}/story/${slugPath}/share?ratio=1:1&section=${sectionParam}`,
      w: 1080,
      h: 1080,
    },
    {
      id: `${sectionId}:share-4-3`,
      label: 'Share 4:3',
      tag: '1440 × 1080',
      src: `${base}/story/${slugPath}/share?ratio=4:3&section=${sectionParam}`,
      w: 1440,
      h: 1080,
    },
    {
      id: `${sectionId}:slides`,
      label: 'Slides',
      tag: '1920 × 1080',
      src: `${base}/story/${slugPath}/slides?embed=1&section=${sectionParam}`,
      w: 1920,
      h: 1080,
    },
    {
      id: `${sectionId}:report`,
      label: 'Report',
      tag: '794 × 1123',
      src: `${base}/story/${slugPath}/report?embed=1&section=${sectionParam}`,
      // A4 portrait at 96dpi — matches ReportShell's print layout.
      w: 794,
      h: 1123,
    },
    {
      id: `${sectionId}:autoplay-9-16`,
      label: 'Autoplay 9:16',
      tag: '414 × 736',
      src: `${base}/story/${slugPath}/autoplay?aspect=9:16&start=${sectionParam}`,
      w: 414,
      h: 736,
    },
    {
      id: `${sectionId}:autoplay-16-9`,
      label: 'Autoplay 16:9',
      tag: '1280 × 720',
      src: `${base}/story/${slugPath}/autoplay?aspect=16:9&start=${sectionParam}`,
      w: 1280,
      h: 720,
    },
  ]
}
