'use client'

import dynamic from 'next/dynamic'

/**
 * Dev-only editor route for diagnosing the merged starship GLB.
 *
 * The R3F scene is dynamic-imported with `ssr: false` because Next 16's
 * server pass otherwise tries to render `<Canvas>` server-side, which
 * doesn't have a DOM/WebGL context. Same pattern as `/starship-preview`.
 *
 * Use this page to:
 *   - Toggle each named part on/off, solo a single part
 *   - Tweak position/rotation/scale per part to find the right adjustments
 *   - Switch material (metal, black, normal, wireframe) to see the geometry
 *   - Show axes, grid, per-part bounding boxes, wireframe overlay
 *   - Copy the resulting adjustments as TS code to paste into
 *     `verticals/starship-viz/scripts/convert-starship-assets.ts`
 *
 * Not linked from the main nav. Keep it in `app/` so changes hot-reload
 * during fixing sessions.
 */
const StarshipEditor = dynamic(() => import('./StarshipEditor'), { ssr: false })

export default function StarshipEditorPage() {
  return <StarshipEditor />
}
