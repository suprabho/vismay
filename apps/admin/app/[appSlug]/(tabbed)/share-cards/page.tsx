import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listFootshortsCompetitions } from '@vismay/content-source/footshortsData'
import { ShareCardCreator } from '@/components/footshorts/sharecard/ShareCardCreator'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

/**
 * Footshorts-only "Share cards" tab — a standalone on-brand share-card creator.
 * Pick real match / standings / form / news data (or generate an AI image),
 * preview the card live, and download a PNG in any social format. Reuses the
 * footshorts data routes (`/api/footshorts/data/*`) + viz components; capture is
 * client-side via html-to-image.
 */
export default async function ShareCardsPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/share-cards`)
  // Share cards are wired to footshorts' football tables; no other vertical has them.
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
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4 text-neutral-100">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold">Share cards</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          Build an on-brand share card from real match data, standings, form, news, or an AI image —
          then download a PNG in any social format.
        </p>
      </div>
      <div className="mt-4 min-h-0 flex-1">
        <ShareCardCreator initialCompetitions={competitions} />
      </div>
    </div>
  )
}
