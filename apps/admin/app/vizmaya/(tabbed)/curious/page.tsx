import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { CuriousClaimsClient } from '@/components/curious/CuriousClaimsClient'

export const dynamic = 'force-dynamic'

/**
 * The Curious Desk's review queue (migration 101): candidate claims from
 * the collect → detect → grade → verify pipeline, each with its evidence
 * quote, its sources grouped by lineage and the features behind its grade.
 * Approve is the only way a claim reaches the desk's pool and the
 * composer's Curious claims library. Data is fetched client-side from
 * /api/vizmaya/curious/claims.
 */
export default async function CuriousClaimsPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/curious')
  return <CuriousClaimsClient />
}
