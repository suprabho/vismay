import { NextResponse } from 'next/server'
import { getContentSource } from '../contentSource'

const SAFE_ID = /^[a-zA-Z0-9_-]+$/

/**
 * GET /api/chart-data/[slug]/[id]
 *
 * Reads chart JSON from the configured CONTENT_SOURCE.
 *
 *   200 <chart-json>
 *   400 invalid slug or id
 *   404 chart not found
 */
export function createChartDataHandler() {
  return {
    async GET(
      _req: Request,
      { params }: { params: Promise<{ slug: string; id: string }> }
    ) {
      const { slug, id } = await params

      // Slug/id format check is still useful: catches bad client requests
      // early and keeps fs-mode safe from path traversal when
      // CONTENT_SOURCE=fs.
      if (!SAFE_ID.test(slug) || !SAFE_ID.test(id)) {
        return NextResponse.json(
          { error: 'invalid slug or id' },
          { status: 400 }
        )
      }

      const data = await getContentSource().readChart(slug, id)
      if (data == null) {
        return NextResponse.json(
          { error: 'chart not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(data)
    },
  }
}
