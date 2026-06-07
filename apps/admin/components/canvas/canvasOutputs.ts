import type { ResolvedUnit } from '@vismay/viz-engine'

/**
 * Group key — outputs that share a render route family. The canvas renders
 * one group at a time (others collapse to a header strip) so the embedded
 * iframe count stays manageable. Order here defines display order.
 */
export type OutputGroupId = 'share' | 'slides' | 'report' | 'autoplay'

/**
 * One renderable output: a target route + native dimensions + which group
 * it belongs to. Consumed by the canvas to build iframe nodes.
 */
export interface OutputNodeData {
  id: string
  group: OutputGroupId
  label: string
  /** Short dims string shown under the label, e.g. "1080 × 1440". */
  tag: string
  /** Full iframe URL (vizmaya-fyi route + signed token + query). */
  src: string
  w: number
  h: number
}

/**
 * Pure spec for one output — path + query on the consumer domain, plus
 * presentation metadata. URL signing happens server-side using these specs
 * (so the HMAC secret never touches client code); the resulting signed URLs
 * are passed back as a map keyed by `id` and read by `buildOutputsForUnit`.
 */
export interface OutputSpec {
  id: string
  group: OutputGroupId
  label: string
  tag: string
  w: number
  h: number
  /** Pathname on the consumer domain, no host, no query. */
  path: string
  /** Query params for the URL. NOT covered by the signature — safe to vary. */
  query: Record<string, string>
}

export interface OutputGroup {
  id: OutputGroupId
  label: string
  /** When true, the group's outputs are aspect-ratio siblings of the
   *  same underlying render — show one at a time with a tab strip. Saves
   *  iframe mounts (Share = 1 iframe instead of 3). When false, the
   *  group's outputs are distinct enough to stack side-by-side. */
  tabbed: boolean
}

export const OUTPUT_GROUPS: readonly OutputGroup[] = [
  // Share cards are just aspect-ratio variants of the same render — tab
  // them so only the active ratio's iframe mounts.
  { id: 'share', label: 'Share', tabbed: true },
  { id: 'slides', label: 'Slides', tabbed: false },
  { id: 'report', label: 'Report', tabbed: false },
  // Autoplay 9:16 vs 16:9 are visually different enough (mobile portrait
  // vs widescreen layout) that side-by-side comparison is the point.
  // Keep them stacked.
  { id: 'autoplay', label: 'Autoplay', tabbed: false },
] as const

/** Default group to load on mount. The other three stay collapsed until
 *  the user clicks their header, so the initial canvas only mounts 3
 *  iframes (the share ratios). */
export const DEFAULT_EXPANDED_GROUP: OutputGroupId = 'share'

/**
 * Build the canonical id for a section's canvas-frame URL. The same id is
 * the key used in the signed-URL map.
 */
export function canvasFrameId(sectionId: string): string {
  return `canvas-frame:${sectionId}`
}

/**
 * Specs for the 7 outputs of one section. Pure data — no host, no signing.
 * Both server (for pre-signing) and client (for layout) iterate this.
 */
export function outputSpecsForUnit(
  unit: ResolvedUnit,
  slug: string
): OutputSpec[] {
  const sectionId = unit.parentConfig.id ?? `section-${unit.parentIndex}`
  const slugPath = encodeURIComponent(slug)
  return [
    {
      id: `${sectionId}:share-3-4`,
      group: 'share',
      label: 'Share 3:4',
      tag: '1080 × 1440',
      w: 1080,
      h: 1440,
      path: `/story/${slugPath}/share`,
      query: { ratio: '3:4', section: sectionId },
    },
    {
      id: `${sectionId}:share-1-1`,
      group: 'share',
      label: 'Share 1:1',
      tag: '1080 × 1080',
      w: 1080,
      h: 1080,
      path: `/story/${slugPath}/share`,
      query: { ratio: '1:1', section: sectionId },
    },
    {
      id: `${sectionId}:share-4-5`,
      group: 'share',
      label: 'Share 4:5',
      tag: '1080 × 1350',
      w: 1080,
      h: 1350,
      path: `/story/${slugPath}/share`,
      query: { ratio: '4:5', section: sectionId },
    },
    {
      id: `${sectionId}:share-4-3`,
      group: 'share',
      label: 'Share 4:3',
      tag: '1440 × 1080',
      w: 1440,
      h: 1080,
      path: `/story/${slugPath}/share`,
      query: { ratio: '4:3', section: sectionId },
    },
    {
      id: `${sectionId}:slides`,
      group: 'slides',
      label: 'Slides',
      tag: '1920 × 1080',
      w: 1920,
      h: 1080,
      path: `/story/${slugPath}/slides`,
      query: { embed: '1', section: sectionId },
    },
    {
      id: `${sectionId}:report`,
      group: 'report',
      label: 'Report',
      tag: '794 × 1123',
      // A4 portrait at 96dpi — matches ReportShell's print layout.
      w: 794,
      h: 1123,
      path: `/story/${slugPath}/report`,
      query: { embed: '1', section: sectionId },
    },
    {
      id: `${sectionId}:autoplay-9-16`,
      group: 'autoplay',
      label: 'Autoplay 9:16',
      tag: '414 × 736',
      w: 414,
      h: 736,
      path: `/story/${slugPath}/autoplay`,
      query: { aspect: '9:16', start: sectionId },
    },
    {
      id: `${sectionId}:autoplay-16-9`,
      group: 'autoplay',
      label: 'Autoplay 16:9',
      tag: '1280 × 720',
      w: 1280,
      h: 720,
      path: `/story/${slugPath}/autoplay`,
      query: { aspect: '16:9', start: sectionId },
    },
  ]
}

/**
 * Derive the output subgraph for a section frame. Each output's `src` comes
 * from the `signedSrcById` map (built server-side); missing entries fall
 * back to an empty src so the layout still renders.
 */
export function buildOutputsForUnit(
  unit: ResolvedUnit,
  slug: string,
  signedSrcById: Record<string, string>
): OutputNodeData[] {
  return outputSpecsForUnit(unit, slug).map((s) => ({
    id: s.id,
    group: s.group,
    label: s.label,
    tag: s.tag,
    w: s.w,
    h: s.h,
    src: signedSrcById[s.id] ?? '',
  }))
}
