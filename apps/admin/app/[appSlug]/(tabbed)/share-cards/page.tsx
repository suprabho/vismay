import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listFootshortsCompetitions } from '@vismay/content-source/footshortsData'
import { ShareCardCreator } from '@/components/footshorts/sharecard/ShareCardCreator'
import { ShareCardCreator as VizmayaShareCardCreator } from '@/components/vizmaya/sharecard/ShareCardCreator'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

/**
 * Per-app share-card tabs.
 *
 * - `footshorts` — the standalone on-brand footshorts creator: pick real match /
 *   standings / form / news data (or generate an AI image), preview live,
 *   download a PNG. Reuses the footshorts data routes + viz components.
 * - `umami` — "Social frames": the vizmaya layer composer in umami mode
 *   (comparison / dish-spotlight / explainer-carousel templates, paper+spice
 *   palettes, dish grounding, AI food imagery). Frames are story-less, so no
 *   story list is fetched.
 *
 * Capture is client-side via html-to-image in both.
 */
export default async function ShareCardsPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/share-cards`)

  if (appSlug === 'umami') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 text-neutral-100">
        <VizmayaShareCardCreator
          mode="umami"
          stories={[]}
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
        />
      </div>
    )
  }

  // The footshorts creator is wired to its football tables; no other vertical
  // has this tab.
  if (appSlug !== 'footshorts') notFound()

  // Degrade to an empty picker rather than 500-ing the tab if the football
  // tables are unreachable (e.g. missing Supabase creds locally). The client
  // already renders a "No ingested data" state.
  let competitions: Awaited<ReturnType<typeof listFootshortsCompetitions>> = []
  try {
    competitions = await listFootshortsCompetitions()
  } catch (e) {
    console.error('share-cards: failed to load competitions', e)
  }

  return (
    <div data-composer-immersive className="min-h-0 flex-1 overflow-hidden text-neutral-100">
      <ShareCardCreator initialCompetitions={competitions} />
    </div>
  )
}
