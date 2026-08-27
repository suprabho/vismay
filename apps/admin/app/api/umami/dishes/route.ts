import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listFoodDishes } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

/**
 * Dish list for the umami "Social frames" dish picker. Returns a trimmed
 * projection of the food canon — deliberately WITHOUT `imageUrl` / `sourceUrl`:
 * the TasteAtlas photography is copyrighted (see
 * vizmaya-data/searching-for-umami/INGEST_NOTES.md), so social frames must
 * never render it; imagery comes from the AI generate-image flow instead.
 */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const dishes = await listFoodDishes('searching-for-umami')
    return NextResponse.json({
      ok: true,
      dishes: dishes.map((d) => ({
        slug: d.slug,
        name: d.name,
        cuisine: d.cuisine,
        region: d.region,
        category: d.category,
        description: d.description,
        rating: d.rating,
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list dishes'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
