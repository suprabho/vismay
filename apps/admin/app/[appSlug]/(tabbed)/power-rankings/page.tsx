import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listPowerRankingSummaries } from '@vismay/content-source/footshortsPowerRankings'
import type { PowerRankingSummary } from '@vismay/content-source/footshortsPowerRankings'
import { PowerRankingsClient } from '@/components/footshorts/powerrankings/PowerRankingsClient'

export const dynamic = 'force-dynamic'

/**
 * Power rankings review tab (footshorts-only): the weekly theanalyst.com Opta
 * Power Rankings scrape lands here as drafts; an editor reviews (fixing
 * unresolved team entities / narrative), then publishes. Drafts are invisible
 * to consumers until published (RLS), which is why this page reads through the
 * service-role content-source module rather than the anon-key client the
 * recaps tab uses — anon reads can't see drafts.
 */
export default async function PowerRankingsPage({
  params,
}: {
  params: Promise<{ appSlug: string }>
}) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}/power-rankings`)

  // Degrade to an empty list if Supabase is unreachable (matches the
  // share-cards page's posture) — the client surfaces load errors on refresh.
  let initial: PowerRankingSummary[] = []
  try {
    initial = await listPowerRankingSummaries()
  } catch {
    initial = []
  }

  return <PowerRankingsClient initial={initial} />
}
