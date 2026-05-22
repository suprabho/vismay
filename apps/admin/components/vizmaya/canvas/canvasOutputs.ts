import type { ResolvedUnit } from '@vismay/viz-engine'
import type { OutputNodeData } from './OutputNode'

/**
 * Group key — outputs that share a render route family. The canvas renders
 * one group at a time (others collapse to a header strip) so the embedded
 * iframe count stays manageable. Order here defines display order.
 */
export type OutputGroupId = 'share' | 'slides' | 'report' | 'autoplay'

export interface OutputGroup {
  id: OutputGroupId
  label: string
}

export const OUTPUT_GROUPS: readonly OutputGroup[] = [
  { id: 'share', label: 'Share' },
  { id: 'slides', label: 'Slides' },
  { id: 'report', label: 'Report' },
  { id: 'autoplay', label: 'Autoplay' },
] as const

/** Default group to load on mount. The other three stay collapsed until
 *  the user clicks their header, so the initial canvas only mounts 3
 *  iframes (the share ratios). */
export const DEFAULT_EXPANDED_GROUP: OutputGroupId = 'share'

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
      group: 'share',
      label: 'Share 3:4',
      tag: '1080 × 1440',
      src: `${base}/story/${slugPath}/share?ratio=3:4&section=${sectionParam}`,
      w: 1080,
      h: 1440,
    },
    {
      id: `${sectionId}:share-1-1`,
      group: 'share',
      label: 'Share 1:1',
      tag: '1080 × 1080',
      src: `${base}/story/${slugPath}/share?ratio=1:1&section=${sectionParam}`,
      w: 1080,
      h: 1080,
    },
    {
      id: `${sectionId}:share-4-3`,
      group: 'share',
      label: 'Share 4:3',
      tag: '1440 × 1080',
      src: `${base}/story/${slugPath}/share?ratio=4:3&section=${sectionParam}`,
      w: 1440,
      h: 1080,
    },
    {
      id: `${sectionId}:slides`,
      group: 'slides',
      label: 'Slides',
      tag: '1920 × 1080',
      src: `${base}/story/${slugPath}/slides?embed=1&section=${sectionParam}`,
      w: 1920,
      h: 1080,
    },
    {
      id: `${sectionId}:report`,
      group: 'report',
      label: 'Report',
      tag: '794 × 1123',
      src: `${base}/story/${slugPath}/report?embed=1&section=${sectionParam}`,
      // A4 portrait at 96dpi — matches ReportShell's print layout.
      w: 794,
      h: 1123,
    },
    {
      id: `${sectionId}:autoplay-9-16`,
      group: 'autoplay',
      label: 'Autoplay 9:16',
      tag: '414 × 736',
      src: `${base}/story/${slugPath}/autoplay?aspect=9:16&start=${sectionParam}`,
      w: 414,
      h: 736,
    },
    {
      id: `${sectionId}:autoplay-16-9`,
      group: 'autoplay',
      label: 'Autoplay 16:9',
      tag: '1280 × 720',
      src: `${base}/story/${slugPath}/autoplay?aspect=16:9&start=${sectionParam}`,
      w: 1280,
      h: 720,
    },
  ]
}

