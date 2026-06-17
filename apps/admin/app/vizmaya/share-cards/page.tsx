import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getAllStories } from '@vismay/content-source/content'
import { ShareCardCreator } from '@/components/vizmaya/sharecard/ShareCardCreator'

export const dynamic = 'force-dynamic'

/**
 * Vizmaya "Share cards" composer — build an on-brand share card from a story's
 * map / data, drop emojis + uploaded / generated / asset images on top, preview
 * live, and download a PNG in any social format (with a saved-card library).
 * The card body reuses the same viz-engine render path as the public share page;
 * capture is client-side via html-to-image.
 */
export default async function ShareCardsPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/share-cards')

  // Degrade to an empty picker rather than 500-ing the tab if the content store
  // is unreachable (e.g. missing Supabase creds locally).
  let stories: Array<{ slug: string; title: string }> = []
  try {
    const all = await getAllStories()
    stories = all.map((s) => ({ slug: s.slug, title: s.title ?? s.slug }))
  } catch (e) {
    console.error('share-cards: failed to load stories', e)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 text-neutral-100">
        <h1 className="text-lg font-semibold">Share cards</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          Compose an on-brand share card from a story&apos;s map and data — add emojis, upload or
          generate images, and drop existing story assets on top — then download a PNG.
        </p>
        <div className="mt-5">
          <ShareCardCreator
            stories={stories}
            accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
          />
        </div>
      </div>
    </div>
  )
}
